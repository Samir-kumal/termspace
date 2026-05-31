import { useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SerializeAddon } from '@xterm/addon-serialize'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import '@xterm/xterm/css/xterm.css'

interface Props {
  terminalId: string
  workspaceId: string
  isActive: boolean
  scrollback?: string[]
  onFocus: () => void
}

export function TerminalPane({ terminalId, workspaceId, isActive, scrollback, onFocus }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const unlistenRef = useRef<Promise<() => void> | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const xterm = new XTerm({
      theme: {
        background: '#161310',
        foreground: '#e8d5b0',
        cursor: '#e8a045',
        cursorAccent: '#1a1612',
        selectionBackground: 'rgba(232,160,69,0.3)',
      },
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 13,
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

    // receive PTY output — store the unlisten promise in a ref so cleanup
    // can cancel it even if the component unmounts before the promise resolves
    unlistenRef.current = listen<string>(`pty-output-${terminalId}`, (e) => {
      xterm.write(e.payload)
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
      style={{
        width: '100%', height: '100%',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden', borderRadius: 4,
        border: isActive ? '1px solid var(--accent)' : '1px solid var(--border-inactive)',
        background: 'var(--bg-terminal)', cursor: 'text',
      }}
    >
      <div ref={containerRef} style={{ flex: 1, minHeight: 0 }} />
    </div>
  )
}
