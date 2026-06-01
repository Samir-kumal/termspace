import { useEffect, useRef, useState, useLayoutEffect } from 'react'
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

export function BrowserPane({
  browserPaneId, initialUrl, isActive, isMaximized: _isMaximized,
  onFocus, onClose, onSplit, onToggleMaximize,
}: Props) {
  const [url, setUrl] = useState(initialUrl)
  const [inputUrl, setInputUrl] = useState(initialUrl)
  const [isEditingUrl, setIsEditingUrl] = useState(false)
  const holeRef = useRef<HTMLDivElement>(null)

  // Sync native webview position whenever the hole div's bounds change
  const syncBounds = () => {
    if (!holeRef.current) return
    const rect = holeRef.current.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) return
    invoke('resize_browser_pane', {
      id: browserPaneId,
      x: rect.left,
      y: rect.top,
      w: rect.width,
      h: rect.height,
    }).catch(() => {}) // non-fatal, next resize will retry
  }

  // ResizeObserver — fires on drag-handle resize
  useLayoutEffect(() => {
    const el = holeRef.current
    if (!el) return
    const ro = new ResizeObserver(syncBounds)
    ro.observe(el)
    syncBounds() // initial sync
    return () => ro.disconnect()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [browserPaneId])

  // Window resize
  useEffect(() => {
    window.addEventListener('resize', syncBounds)
    return () => window.removeEventListener('resize', syncBounds)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [browserPaneId])

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
      style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', minWidth: 0, minHeight: 0 }}
      onClick={onFocus}
    >
      {/* Header bar — real React HTML */}
      <div style={{
        height: 36, display: 'flex', alignItems: 'center', padding: '0 8px', gap: 6,
        background: 'var(--bg-panel, #1e1e1e)', borderBottom: `1px solid ${borderColor}`,
        flexShrink: 0,
      }}>
        {/* Back */}
        <button
          onClick={(e) => { e.stopPropagation(); invoke('browser_go_back', { id: browserPaneId }) }}
          style={btnStyle}
          title="Back"
        >&#8592;</button>
        {/* Forward */}
        <button
          onClick={(e) => { e.stopPropagation(); invoke('browser_go_forward', { id: browserPaneId }) }}
          style={btnStyle}
          title="Forward"
        >&#8594;</button>
        {/* Reload */}
        <button
          onClick={(e) => { e.stopPropagation(); invoke('browser_reload', { id: browserPaneId }) }}
          style={btnStyle}
          title="Reload"
        >&#8635;</button>

        {/* URL bar */}
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
              flex: 1, height: 22, background: '#2a2a2a', border: '1px solid #4a7aff',
              borderRadius: 4, color: '#ccc', fontSize: 11, fontFamily: 'monospace',
              padding: '0 8px', outline: 'none',
            }}
          />
        ) : (
          <div
            onClick={(e) => { e.stopPropagation(); setIsEditingUrl(true) }}
            style={{
              flex: 1, height: 22, background: '#2a2a2a', border: '1px solid #333',
              borderRadius: 4, display: 'flex', alignItems: 'center', padding: '0 8px',
              gap: 4, cursor: 'text',
            }}
          >
            <span style={{ fontSize: 10, color: '#888' }}>&#127760;</span>
            <span style={{ fontSize: 11, color: '#bbb', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {url || 'about:blank'}
            </span>
          </div>
        )}

        {/* Action buttons */}
        <button onClick={(e) => { e.stopPropagation(); onSplit('horizontal') }} style={btnStyle} title="Split right">&#8863;</button>
        <button onClick={(e) => { e.stopPropagation(); onSplit('vertical') }} style={btnStyle} title="Split down">&#8862;</button>
        <button onClick={(e) => { e.stopPropagation(); onToggleMaximize() }} style={btnStyle} title="Maximize">&#10562;</button>
        <button onClick={(e) => { e.stopPropagation(); onClose() }} style={{ ...btnStyle, color: '#e06c75' }} title="Close">&#x2715;</button>
      </div>

      {/* Transparent hole — native webview floats here */}
      <div
        ref={holeRef}
        style={{ flex: 1, minHeight: 0, minWidth: 0, background: 'transparent' }}
      />
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  width: 22, height: 22, background: 'transparent', border: '1px solid #333',
  borderRadius: 4, color: '#999', fontSize: 12, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
}
