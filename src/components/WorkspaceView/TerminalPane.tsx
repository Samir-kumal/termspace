import { useEffect, useRef, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SerializeAddon } from '@xterm/addon-serialize'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
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

export function TerminalPane({ terminalId, workspaceId, isActive, isMaximized, scrollback, onFocus, onToggleMaximize, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const unlistenRef = useRef<Promise<() => void> | null>(null)
  const [isHovered, setIsHovered] = useState(false)
  
  const settings = useAppStore((s) => s.settings)

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
    xterm.loadAddon(fitAddon)
    xterm.loadAddon(serializeAddon)
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
      invoke('close_terminal', { id: terminalId, scrollback: lines }).catch(console.error)
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
      style={{
        width: '100%', height: '100%',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden', borderRadius: 8,
        border: isActive ? '1px solid var(--accent)' : '1px solid var(--border-inactive)',
        boxShadow: isActive ? '0 0 0 1px var(--accent), 0 4px 12px rgba(0,0,0,0.1)' : '0 2px 8px rgba(0,0,0,0.05)',
        background: 'var(--bg-terminal)', cursor: 'text',
        position: 'relative',
        transition: 'border 0.2s, box-shadow 0.2s'
      }}
    >
      <div style={{ flex: 1, minHeight: 0, padding: '10px 0 10px 12px' }}>
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      </div>
      {isHovered && (
        <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 10, display: 'flex', gap: 6 }}>
          <div
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('application/terminal-id', terminalId)
              e.dataTransfer.effectAllowed = 'move'
            }}
            title="Drag to reorder"
            style={{
              width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(34, 30, 24, 0.8)', border: '1px solid var(--border-inactive)',
              borderRadius: 6, color: 'var(--text-inactive)', cursor: 'grab',
              fontSize: 12, backdropFilter: 'blur(4px)', transition: 'all 0.15s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#ffffff'
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.5)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--text-inactive)'
              e.currentTarget.style.borderColor = 'var(--border-inactive)'
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/></svg>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onToggleMaximize()
            }}
            title={isMaximized ? "Restore terminal" : "Maximize terminal"}
            style={{
              width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(34, 30, 24, 0.8)', border: '1px solid var(--border-inactive)',
              borderRadius: 6, color: 'var(--text-inactive)', cursor: 'pointer',
              fontSize: 12, backdropFilter: 'blur(4px)', transition: 'all 0.15s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#e8a045'
              e.currentTarget.style.borderColor = 'rgba(232, 160, 69, 0.5)'
              e.currentTarget.style.background = 'rgba(232, 160, 69, 0.1)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--text-inactive)'
              e.currentTarget.style.borderColor = 'var(--border-inactive)'
              e.currentTarget.style.background = 'rgba(34, 30, 24, 0.8)'
            }}
          >
            {isMaximized ? '↙' : '↗'}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onClose()
            }}
            title="Close terminal"
            style={{
              width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(34, 30, 24, 0.8)', border: '1px solid var(--border-inactive)',
              borderRadius: 6, color: 'var(--text-inactive)', cursor: 'pointer',
              fontSize: 16, lineHeight: 1, paddingBottom: 2, backdropFilter: 'blur(4px)', transition: 'all 0.15s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#e07b7b'
              e.currentTarget.style.borderColor = 'rgba(224, 123, 123, 0.5)'
              e.currentTarget.style.background = 'rgba(224, 123, 123, 0.1)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--text-inactive)'
              e.currentTarget.style.borderColor = 'var(--border-inactive)'
              e.currentTarget.style.background = 'rgba(34, 30, 24, 0.8)'
            }}
          >
            ×
          </button>
        </div>
      )}
    </div>
  )
}
