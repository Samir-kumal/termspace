import { useEffect, useRef, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SerializeAddon } from '@xterm/addon-serialize'
import { SearchAddon } from '@xterm/addon-search'
import { invoke, listen } from '../../utils/tauri'
import { useAppStore } from '../../store/useAppStore'
import '@xterm/xterm/css/xterm.css'

interface Props {
  terminalId: string
  workspaceId: string
  isActive: boolean
  isMaximized: boolean
  scrollback?: string[]
  onFocus: () => void
  onToggleMaximize: () => void
  onClose: () => void
  onSplit: (direction: 'horizontal' | 'vertical') => void
  isDragOver?: boolean
}

const XTERM_THEMES = {
  'warm-dark': {
    background: '#161310',
    foreground: '#e8d5b0',
    cursor: '#e8a045',
    cursorAccent: '#1a1612',
    selectionBackground: 'rgba(232,160,69,0.3)',
  },
  'cold-dark': {
    background: '#0d1117',
    foreground: '#c9d1d9',
    cursor: '#58a6ff',
    cursorAccent: '#161b22',
    selectionBackground: 'rgba(88,166,255,0.3)',
  },
  'light': {
    background: '#ffffff',
    foreground: '#24292f',
    cursor: '#0969da',
    cursorAccent: '#ffffff',
    selectionBackground: 'rgba(9,105,218,0.3)',
  }
}

import { useKeybindingHandler } from '../../hooks/useGlobalKeybindings'

export function TerminalPane({ terminalId, workspaceId, isActive, isMaximized, scrollback, onFocus, onToggleMaximize, onClose, onSplit, isDragOver }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const searchAddonRef = useRef<SearchAddon | null>(null)
  const unlistenRef = useRef<Promise<() => void> | null>(null)
  const [isHovered, setIsHovered] = useState(false)
  
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  const terminal = useAppStore(s => s.terminalsByWorkspace[workspaceId]?.find(t => t.id === terminalId))
  const renameTerminal = useAppStore(s => s.renameTerminal)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editTitleValue, setEditTitleValue] = useState('')

  const handleTitleSave = () => {
    setIsEditingTitle(false)
    if (editTitleValue.trim() !== terminal?.title) {
      renameTerminal(workspaceId, terminalId, editTitleValue.trim())
      invoke('rename_terminal', { id: terminalId, title: editTitleValue.trim() }).catch(console.error)
    }
  }

  const settings = useAppStore((s) => s.settings)
  const keybindingHandler = useKeybindingHandler()
  const keybindingHandlerRef = useRef(keybindingHandler)

  useEffect(() => {
    keybindingHandlerRef.current = keybindingHandler
  }, [keybindingHandler])

  // Apply settings to XTerm whenever they change
  useEffect(() => {
    if (xtermRef.current) {
      xtermRef.current.options.theme = XTERM_THEMES[settings.theme]
      xtermRef.current.options.fontSize = settings.fontSize
    }
  }, [settings])

  useEffect(() => {
    if (!containerRef.current) return

    const xterm = new XTerm({
      theme: XTERM_THEMES[settings.theme],
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: settings.fontSize,
      lineHeight: 1.4,
      cursorBlink: true,
    })

    const fitAddon = new FitAddon()
    const serializeAddon = new SerializeAddon()
    const searchAddon = new SearchAddon()
    xterm.loadAddon(fitAddon)
    xterm.loadAddon(serializeAddon)
    xterm.loadAddon(searchAddon)
    searchAddonRef.current = searchAddon
    
    xterm.attachCustomKeyEventHandler((e) => {
      if (e.type === 'keydown') {
        // Cmd/Ctrl + F to toggle search
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
          e.preventDefault()
          setShowSearch(true)
          setTimeout(() => searchInputRef.current?.focus(), 50)
          return false
        }

        // Force explicit backspace handling to bypass any xterm/DOM swallowing
        if (e.key === 'Backspace') {
          // On macOS, \x7f (DEL) is standard for backspace, but sometimes \x08 is needed
          // We will send \x7f explicitly.
          invoke('write_pty', { terminalId, data: '\x7f' }).catch(console.error)
          return false // Tell xterm to not process it natively
        }
        
        const handled = keybindingHandlerRef.current(e)
        if (handled) return false // Tell xterm not to process this key
      }
      return true
    })

    xterm.open(containerRef.current)
    fitAddon.fit()
    xtermRef.current = xterm

    // replay saved scrollback
    if (scrollback && scrollback.length > 0) {
      xterm.write(scrollback.join(''))
    }

    xterm.focus()

    // send keystrokes to PTY
    const onDataDispose = xterm.onData((data) => {
      console.log('XTERM DATA:', Array.from(data).map(c => c.charCodeAt(0)), JSON.stringify(data))
      invoke('write_pty', { terminalId, data }).catch(console.error)
    })

    // Attach listener first, then tell Rust to start streaming — prevents
    // the shell's initial prompt from being emitted before anyone is listening.
    unlistenRef.current = listen<string>(`pty-output-${terminalId}`, (e) => {
      xterm.write(e.payload)
    })
    unlistenRef.current.then(() => {
      invoke('start_terminal', { terminalId }).catch(console.error)
    })

    // resize observer keeps cols/rows in sync with DOM
    const ro = new ResizeObserver(() => {
      fitAddon.fit()
      invoke('resize_pty', { terminalId, cols: xterm.cols, rows: xterm.rows }).catch(console.error)
    })
    ro.observe(containerRef.current)

    return () => {
      onDataDispose.dispose()
      unlistenRef.current?.then((fn) => fn()).catch(() => {})
      ro.disconnect()
      const lines = serializeAddon.serialize().split('\n')
      // Only save scrollback on unmount, do NOT kill the backend process
      // because unmount happens naturally when layout is reparented or workspace switched.
      invoke('save_scrollback', { id: terminalId, scrollback: lines }).catch(console.error)
      xterm.dispose()
      // Note: removeTerminal is intentionally NOT called here.
      // The parent (App.tsx activateWorkspace) owns terminal lifecycle in the store.
    }
  }, [terminalId, workspaceId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isActive) xtermRef.current?.focus()
  }, [isActive])

  return (
    <div
      onClick={onFocus}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onContextMenu={(e) => {
        // Only trigger our context menu if clicking near the top/edges, not inside the actual terminal text area
        // to preserve native copy/paste context menus. Or we just allow it on the container.
        // Actually xterm intercepts right clicks in its text area! So container right-click is fine.
        e.preventDefault()
        e.stopPropagation()
        useAppStore.getState().showContextMenu(e.clientX, e.clientY, [
          {
            label: 'Clear Output',
            icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>,
            onClick: () => {
              xtermRef.current?.clear()
            }
          },
          { separator: true, label: '', onClick: () => {} },
          {
            label: 'Split Down',
            icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="12" x2="21" y2="12"></line></svg>,
            onClick: () => onSplit('horizontal')
          },
          {
            label: 'Split Right',
            icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="12" y1="3" x2="12" y2="21"></line></svg>,
            onClick: () => onSplit('vertical')
          },
          { separator: true, label: '', onClick: () => {} },
          {
            label: isMaximized ? 'Restore' : 'Maximize',
            icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>,
            onClick: onToggleMaximize
          },
          {
            label: 'Close Terminal',
            danger: true,
            icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>,
            onClick: onClose
          }
        ])
      }}
      style={{
        width: '100%', height: '100%',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden', borderRadius: 8,
        border: isDragOver 
          ? '2px dashed var(--accent)' 
          : (isActive ? '1px solid var(--accent)' : '1px solid var(--border-inactive)'),
        boxShadow: isDragOver
          ? 'inset 0 0 0 1px var(--accent), 0 8px 24px rgba(0,0,0,0.15)'
          : (isActive ? '0 0 0 1px var(--accent), 0 4px 12px rgba(0,0,0,0.1)' : '0 2px 8px rgba(0,0,0,0.05)'),
        background: 'var(--bg-terminal)', cursor: 'text',
        position: 'relative',
        transition: 'border 0.2s, box-shadow 0.2s',
        opacity: isDragOver ? 0.7 : 1,
      }}
    >
      <div style={{ flex: 1, minHeight: 0, padding: '10px 0 10px 12px' }}>
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      </div>

      {showSearch && (
        <div
          style={{
            position: 'absolute', top: 10, right: 10, zIndex: 20,
            background: 'var(--bg-sidebar)', border: '1px solid var(--border-inactive)',
            borderRadius: 6, padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 6,
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
          }}
          onClick={e => e.stopPropagation()}
        >
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Find..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              searchAddonRef.current?.findNext(e.target.value)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (e.shiftKey) searchAddonRef.current?.findPrevious(searchQuery)
                else searchAddonRef.current?.findNext(searchQuery)
              }
              if (e.key === 'Escape') {
                setShowSearch(false)
                xtermRef.current?.focus()
              }
            }}
            style={{
              background: 'transparent', border: 'none', color: 'var(--text-active)',
              outline: 'none', fontSize: 13, width: 150
            }}
          />
          <button
            onClick={() => searchAddonRef.current?.findPrevious(searchQuery)}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-inactive)', cursor: 'pointer', padding: 2 }}
            title="Find Previous (Shift+Enter)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>
          </button>
          <button
            onClick={() => searchAddonRef.current?.findNext(searchQuery)}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-inactive)', cursor: 'pointer', padding: 2 }}
            title="Find Next (Enter)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </button>
          <div style={{ width: 1, height: 16, background: 'var(--border-inactive)', margin: '0 2px' }} />
          <button
            onClick={() => {
              setShowSearch(false)
              xtermRef.current?.focus()
            }}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-inactive)', cursor: 'pointer', padding: 2 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
      )}
      {!showSearch && (
        <div
          style={{
            position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 10,
            display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px',
            background: 'var(--bg-item)',
            border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border-inactive)'}`,
            borderRadius: 20,
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            opacity: isHovered || isActive ? 1 : 0.6,
            transition: 'opacity 0.2s, border-color 0.2s'
          }}
        >
          {isEditingTitle ? (
            <input
              autoFocus
              value={editTitleValue}
              onChange={e => setEditTitleValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleTitleSave()
                if (e.key === 'Escape') setIsEditingTitle(false)
              }}
              onBlur={handleTitleSave}
              style={{
                background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-active)',
                fontSize: 12, width: 80, textAlign: 'center', fontFamily: 'inherit'
              }}
            />
          ) : (
            <div
              onDoubleClick={() => {
                setEditTitleValue(terminal?.title || 'Terminal')
                setIsEditingTitle(true)
              }}
              style={{
                fontSize: 12, color: isActive ? 'var(--text-active)' : 'var(--text-inactive)',
                cursor: 'text', userSelect: 'none', fontWeight: 500
              }}
            >
              {terminal?.title || 'Terminal'}
            </div>
          )}

          <div
            draggable
            onDragStart={(e) => {
              e.stopPropagation()
              e.dataTransfer.setData('application/terminal-id', terminalId)
              e.dataTransfer.effectAllowed = 'move'
            }}
            title="Drag to reorder"
            style={{ color: 'var(--text-dim)', cursor: 'grab', display: 'flex' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text-active)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-dim)'}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/></svg>
          </div>

          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 4 }}>
            <button
              onClick={(e) => { e.stopPropagation(); onSplit('vertical') }}
              title="Split Right"
              style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', display: 'flex' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--text-active)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-dim)'}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="12" y1="3" x2="12" y2="21"></line></svg>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onSplit('horizontal') }}
              title="Split Down"
              style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', display: 'flex' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--text-active)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-dim)'}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="12" x2="21" y2="12"></line></svg>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onToggleMaximize() }}
              title={isMaximized ? "Restore" : "Maximize"}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 12, lineHeight: 1 }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--accent)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-dim)'}
            >
              {isMaximized ? '↙' : '↗'}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onClose() }}
              title="Close"
              style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 14, lineHeight: 1, paddingBottom: 2 }}
              onMouseEnter={e => e.currentTarget.style.color = '#e07b7b'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-dim)'}
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
