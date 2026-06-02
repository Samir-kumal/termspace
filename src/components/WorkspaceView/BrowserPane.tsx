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
  onSplit: (direction: 'horizontal' | 'vertical', initialUrl?: string) => void
  onToggleMaximize: () => void
}

const HEADER_HEIGHT = 72 // 28 (tab bar) + 44 (url bar)

export function BrowserPane({
  browserPaneId, initialUrl, isActive, isMaximized: _isMaximized,
  onFocus, onClose, onSplit, onToggleMaximize,
}: Props) {
  // Tabs state
  const [tabs, setTabs] = useState<{ id: string; url: string; title: string, isDiscarded?: boolean }[]>([
    { id: browserPaneId, url: initialUrl, title: 'New Tab' }
  ])
  const [activeTabId, setActiveTabId] = useState(browserPaneId)
  
  // The url/inputUrl now reflect the *active* tab
  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0]
  const [url, setUrl] = useState(activeTab?.url || initialUrl)
  const [inputUrl, setInputUrl] = useState(activeTab?.url || initialUrl)
  const [isEditingUrl, setIsEditingUrl] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Sync native webview position whenever the container bounds change.
  const syncBounds = useCallback(() => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    if (rect.width < 1 || rect.height <= HEADER_HEIGHT) return
    
    const MACOS_TITLEBAR_HEIGHT = 28;

    // Show the active tab's webview (in case it was hidden by an unmount)
    invoke('show_browser_pane', { id: activeTabId }).catch(() => {})

    // Resize the active tab's webview to fit the hole
    invoke('resize_browser_pane', {
      id: activeTabId,
      x: rect.left,
      y: rect.top + HEADER_HEIGHT + MACOS_TITLEBAR_HEIGHT,
      w: rect.width,
      h: rect.height - HEADER_HEIGHT,
    }).catch(() => {})

    // Hide inactive tabs by moving them off-screen
    tabs.forEach(tab => {
      if (tab.id !== activeTabId && !tab.isDiscarded) {
        invoke('resize_browser_pane', {
          id: tab.id,
          x: -10000,
          y: -10000,
          w: 800,
          h: 600,
        }).catch(() => {})
      }
    })
  }, [activeTabId, tabs])

  // Sync when activeTabId changes or wake up discarded tab
  useEffect(() => {
    if (activeTab) {
      setUrl(activeTab.url)
      setInputUrl(activeTab.url)
      
      // Wake up discarded tab
      if (activeTab.isDiscarded) {
        invoke('spawn_ephemeral_browser_pane', {
          id: activeTab.id,
          url: activeTab.url,
          x: -10000, y: -10000, w: 800, h: 600,
        }).then(() => {
          setTabs(current => current.map(t => t.id === activeTab.id ? { ...t, isDiscarded: false } : t))
          setTimeout(syncBounds, 50)
        }).catch(err => {
          console.error('Failed to wake up tab:', err)
        })
      }
    }
    syncBounds()
  }, [activeTabId, activeTab, syncBounds])

  // Memory manager: discard inactive tabs after 2 minutes
  useEffect(() => {
    const intervals = tabs.map(tab => {
      if (tab.id === activeTabId) return null
      if (tab.isDiscarded) return null
      
      // If not active, start a timeout to discard
      return setTimeout(() => {
        setTabs(currentTabs => currentTabs.map(t => t.id === tab.id ? { ...t, isDiscarded: true } : t))
        invoke('destroy_ephemeral_browser_pane', { id: tab.id }).catch(() => {})
      }, 2 * 60 * 1000)
    })
    
    return () => intervals.forEach(i => i && clearTimeout(i))
  }, [tabs, activeTabId])

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(syncBounds)
    ro.observe(el)
    syncBounds()
    return () => ro.disconnect()
  }, [syncBounds])

  useEffect(() => {
    window.addEventListener('resize', syncBounds)
    return () => window.removeEventListener('resize', syncBounds)
  }, [syncBounds])

  // Listen for URL changes for *any* of our tabs
  useEffect(() => {
    const unlisten = listen<{ id: string; url: string }>('browser-pane-url-changed', (event) => {
      setTabs(currentTabs => {
        const tabExists = currentTabs.some(t => t.id === event.payload.id)
        if (!tabExists) return currentTabs
        
        return currentTabs.map(t => {
          if (t.id === event.payload.id) {
            return { ...t, url: event.payload.url }
          }
          return t
        })
      })

      if (event.payload.id === activeTabId) {
        setUrl(event.payload.url)
        setInputUrl(event.payload.url)
      }
      
      // If it's the primary tab, save to DB
      if (event.payload.id === browserPaneId) {
        invoke('save_browser_pane_url', { id: browserPaneId, url: event.payload.url }).catch(() => {})
      }
    })
    
    const unlistenPopup = listen<{ id: string; url: string }>('browser-pane-popup-requested', (event) => {
      // If the popup comes from ANY of our tabs, open it as a new tab here!
      if (!tabs.some(t => t.id === event.payload.id)) return
      handleAddTab(event.payload.url)
    })
    
    return () => { 
      unlisten.then(fn => fn()) 
      unlistenPopup.then(fn => fn())
    }
  }, [activeTabId, tabs, browserPaneId])

  const tabsRef = useRef(tabs)
  useEffect(() => {
    tabsRef.current = tabs
  }, [tabs])

  // Hide all non-discarded webviews on unmount
  useEffect(() => {
    return () => {
      tabsRef.current.forEach(tab => {
        if (!tab.isDiscarded) {
          invoke('hide_browser_pane', { id: tab.id }).catch(() => {})
        }
      })
    }
  }, []) // Empty dependency array ensures this ONLY runs on unmount

  const handleNavigate = (target: string) => {
    const isUrl = /^[a-zA-Z0-9\-\.]+\.[a-zA-Z]{2,6}(:[0-9]{1,5})?(\/.*)?$/.test(target) || target.startsWith('http://') || target.startsWith('https://') || target.startsWith('localhost:') || target.startsWith('127.0.0.1:')
    const normalized = isUrl ? (target.startsWith('http') ? target : `https://${target}`) : `https://www.google.com/search?q=${encodeURIComponent(target)}`
    
    setUrl(normalized)
    setInputUrl(normalized)
    setIsEditingUrl(false)
    
    setTabs(currentTabs => currentTabs.map(t => t.id === activeTabId ? { ...t, url: normalized } : t))
    invoke('navigate_browser_pane', { id: activeTabId, url: normalized }).catch(() => {})
  }
  
  const handleAddTab = async (targetUrl: string = 'https://google.com') => {
    const newTabId = `ephemeral-tab-${Date.now()}`
    try {
      await invoke('spawn_ephemeral_browser_pane', {
        id: newTabId,
        url: targetUrl,
        x: -10000, y: -10000, w: 800, h: 600,
      })
      setTabs(currentTabs => [...currentTabs, { id: newTabId, url: targetUrl, title: 'New Tab' }])
      setActiveTabId(newTabId)
    } catch (err) {
      console.error('Failed to spawn ephemeral tab:', err)
      alert(`Failed to spawn tab: ${err}\n\nDid you completely restart the terminal backend (Ctrl+C and npm run tauri dev) after I added the new commands?`)
    }
  }

  const handleCloseTab = async (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation()
    if (tabs.length === 1) {
      // If it's the last tab, close the whole pane
      onClose()
      return
    }
    
    const idx = tabs.findIndex(t => t.id === tabId)
    const newTabs = tabs.filter(t => t.id !== tabId)
    setTabs(newTabs)
    
    if (activeTabId === tabId) {
      // Activate the previous tab, or the next one if it was the first
      const newActiveIdx = Math.max(0, idx - 1)
      setActiveTabId(newTabs[newActiveIdx].id)
    }
    
    if (tabId === browserPaneId) {
      invoke('hide_browser_pane', { id: tabId }).catch(() => {})
    } else {
      invoke('destroy_ephemeral_browser_pane', { id: tabId }).catch(() => {})
    }
  }

  const borderColor = isActive ? 'var(--accent, #4a7aff)' : 'var(--border-inactive, #333)'

  return (
    <div
      ref={containerRef}
      style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', minWidth: 0, minHeight: 0 }}
      onClick={onFocus}
    >
      {/* Tab Bar */}
      <div style={{
        height: 28, display: 'flex', background: '#111214', overflowX: 'auto',
        borderBottom: `1px solid ${borderColor}`, padding: '0 8px 0 8px', gap: 2, alignItems: 'flex-end',
        flexShrink: 0,
      }}>
        {tabs.map((tab) => (
          <div
            key={tab.id}
            onClick={() => setActiveTabId(tab.id)}
            style={{
              height: 24, minWidth: 120, maxWidth: 200, padding: '0 8px',
              background: activeTabId === tab.id ? '#202124' : 'transparent',
              color: activeTabId === tab.id ? '#e8eaed' : '#9aa0a6',
              opacity: tab.isDiscarded ? 0.6 : 1,
              borderTopLeftRadius: 6, borderTopRightRadius: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              cursor: 'pointer',
              borderLeft: activeTabId === tab.id ? `1px solid ${borderColor}` : 'none',
              borderRight: activeTabId === tab.id ? `1px solid ${borderColor}` : 'none',
              borderTop: activeTabId === tab.id ? `1px solid ${borderColor}` : 'none',
            }}
          >
            <span style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {tab.isDiscarded ? '💤 ' : ''}{tab.url.replace(/^https?:\/\//, '').replace(/^www\./, '') || 'New Tab'}
            </span>
            <div 
              onClick={(e) => handleCloseTab(e, tab.id)}
              style={{ padding: 2, borderRadius: 4, cursor: 'pointer', display: 'flex', opacity: 0.6 }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
              onMouseLeave={(e) => e.currentTarget.style.opacity = '0.6'}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </div>
          </div>
        ))}
        <div 
          onClick={() => handleAddTab()}
          style={{ 
            height: 20, width: 20, margin: '0 4px 2px 4px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: '#9aa0a6', borderRadius: 4
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = '#2a2b2f'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
        </div>
      </div>

      {/* Traditional Browser Header */}
      <div style={{
        height: 44, display: 'flex', alignItems: 'center', padding: '0 12px', gap: 8,
        background: '#202124', borderBottom: `1px solid ${borderColor}`,
        flexShrink: 0,
      }}>
        {/* Navigation Buttons */}
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={(e) => { e.stopPropagation(); invoke('browser_go_back', { id: activeTabId }) }} style={navBtnStyle} title="Back">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          </button>
          <button onClick={(e) => { e.stopPropagation(); invoke('browser_go_forward', { id: activeTabId }) }} style={navBtnStyle} title="Forward">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </button>
          <button onClick={(e) => { e.stopPropagation(); invoke('browser_reload', { id: activeTabId }) }} style={navBtnStyle} title="Reload">
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
