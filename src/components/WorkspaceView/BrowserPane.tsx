import { useEffect, useRef, useState, useLayoutEffect, useCallback } from 'react'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '../../utils/tauri'

interface Props {
  browserPaneId: string
  initialUrl: string
  isActive: boolean
  isMaximized: boolean
  onFocus: () => void
  onClose: () => void
  onSplit: (direction: 'horizontal' | 'vertical') => void
  onToggleMaximize: () => void
}

const HEADER_HEIGHT = 44

export function BrowserPane({
  browserPaneId, initialUrl, isActive, isMaximized: _isMaximized,
  onFocus, onClose, onSplit, onToggleMaximize,
}: Props) {
  const [url, setUrl] = useState(initialUrl)
  const [inputUrl, setInputUrl] = useState(initialUrl)
  const [isEditingUrl, setIsEditingUrl] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Sync native webview position whenever the container bounds change.
  // Measure the container (not the hole) and offset by HEADER_HEIGHT — this
  // is robust against the hole having height=0 before the panel fully sizes up.
  const syncBounds = useCallback(() => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    if (rect.width < 1 || rect.height <= HEADER_HEIGHT) return
    
    // Tauri v2 on macOS positions the Webview relative to the *window* frame (including the title bar).
    // React's getBoundingClientRect is relative to the *client area*.
    // A standard macOS title bar is 28 logical pixels tall. We must add this offset manually
    // because window.outerHeight - innerHeight is unreliable in webkit.
    const MACOS_TITLEBAR_HEIGHT = 28;

    invoke('resize_browser_pane', {
      id: browserPaneId,
      x: rect.left,
      y: rect.top + HEADER_HEIGHT + MACOS_TITLEBAR_HEIGHT,
      w: rect.width,
      h: rect.height - HEADER_HEIGHT,
    }).catch(() => {}) // non-fatal, next resize will retry
  }, [browserPaneId])

  // ResizeObserver — fires on drag-handle resize
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(syncBounds)
    ro.observe(el)
    syncBounds() // initial sync
    return () => ro.disconnect()
  }, [syncBounds])

  // Window resize
  useEffect(() => {
    window.addEventListener('resize', syncBounds)
    return () => window.removeEventListener('resize', syncBounds)
  }, [syncBounds])

  // Listen for URL change events from native webview
  useEffect(() => {
    const unlisten = listen<{ id: string; url: string }>('browser-pane-url-changed', (event) => {
      if (event.payload.id !== browserPaneId) return
      const newUrl = event.payload.url
      setUrl(newUrl)
      setInputUrl(newUrl)
      invoke('save_browser_pane_url', { id: browserPaneId, url: newUrl }).catch(() => {})
    })
    return () => { unlisten.then(fn => fn()) }
  }, [browserPaneId])

  // Hide native webview on unmount (workspace switch) — not destroy
  useEffect(() => {
    return () => {
      invoke('hide_browser_pane', { id: browserPaneId }).catch(() => {})
    }
  }, [browserPaneId])

  const handleNavigate = (target: string) => {
    const normalized = target.startsWith('http') ? target : `https://${target}`
    setUrl(normalized)
    setInputUrl(normalized)
    setIsEditingUrl(false)
    invoke('navigate_browser_pane', { id: browserPaneId, url: normalized }).catch(() => {})
  }

  const borderColor = isActive ? 'var(--accent, #4a7aff)' : 'var(--border-inactive, #333)'

  return (
    <div
      ref={containerRef}
      style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', minWidth: 0, minHeight: 0 }}
      onClick={onFocus}
    >
      {/* Traditional Browser Header */}
      <div style={{
        height: 44, display: 'flex', alignItems: 'center', padding: '0 12px', gap: 8,
        background: '#202124', borderBottom: `1px solid ${borderColor}`,
        flexShrink: 0,
      }}>
        {/* Navigation Buttons */}
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={(e) => { e.stopPropagation(); invoke('browser_go_back', { id: browserPaneId }) }} style={navBtnStyle} title="Back">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          </button>
          <button onClick={(e) => { e.stopPropagation(); invoke('browser_go_forward', { id: browserPaneId }) }} style={navBtnStyle} title="Forward">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </button>
          <button onClick={(e) => { e.stopPropagation(); invoke('browser_reload', { id: browserPaneId }) }} style={navBtnStyle} title="Reload">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
          </button>
        </div>

        {/* Address Bar */}
        <div style={{
          flex: 1, height: 28, background: '#171717', borderRadius: 14,
          display: 'flex', alignItems: 'center', padding: '0 16px', gap: 8,
          border: '1px solid #333', minWidth: 0,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9aa0a6" strokeWidth="2" style={{ flexShrink: 0 }}><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
          {isEditingUrl ? (
            <input
              autoFocus
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleNavigate(inputUrl)
                if (e.key === 'Escape') { setIsEditingUrl(false); setInputUrl(url) }
              }}
              onBlur={() => { setIsEditingUrl(false); setInputUrl(url) }}
              style={{
                flex: 1, background: 'transparent', border: 'none',
                color: '#e8eaed', fontSize: 13, outline: 'none', minWidth: 0,
              }}
            />
          ) : (
            <div
              onClick={(e) => { e.stopPropagation(); setIsEditingUrl(true) }}
              style={{ flex: 1, cursor: 'text', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              <span style={{ fontSize: 13, color: '#e8eaed' }}>
                {url || 'https://google.com'}
              </span>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={(e) => { e.stopPropagation(); onSplit('horizontal') }} style={navBtnStyle} title="Split right">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><path d="M12 3v18"/></svg>
          </button>
          <button onClick={(e) => { e.stopPropagation(); onSplit('vertical') }} style={navBtnStyle} title="Split down">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><path d="M3 12h18"/></svg>
          </button>
          <button onClick={(e) => { e.stopPropagation(); onToggleMaximize() }} style={navBtnStyle} title="Maximize">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3H5a2 2 0 00-2 2v3M21 8V5a2 2 0 00-2-2h-3M3 16v3a2 2 0 002 2h3M16 21h3a2 2 0 002-2v-3"/></svg>
          </button>
          <button onClick={(e) => { e.stopPropagation(); onClose() }} style={{ ...navBtnStyle, color: '#e06c75' }} title="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
      </div>

      {/* Transparent hole — native webview floats here, positioned via containerRef + HEADER_HEIGHT offset */}
      <div style={{ flex: 1, minHeight: 0, minWidth: 0, background: 'transparent' }} />
    </div>
  )
}

const navBtnStyle: React.CSSProperties = {
  width: 28, height: 28, background: 'transparent', border: 'none',
  borderRadius: 6, color: '#9aa0a6', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
}
