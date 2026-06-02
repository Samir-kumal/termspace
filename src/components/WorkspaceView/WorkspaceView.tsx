import { useEffect, useState } from 'react'
import { invoke } from '../../utils/tauri'
import { useAppStore } from '../../store/useAppStore'
import { Workspace, Terminal, BrowserPane as BrowserPaneType } from '../../types'
import { TerminalGrid } from './TerminalGrid'
import { WorkspaceHeader } from './WorkspaceHeader'

interface Props {
  workspace: Workspace
  onEditWorkspace: (workspace: Workspace) => void
}

// Stable references — prevents Zustand infinite re-render when no items exist yet
const EMPTY_TERMINALS: Terminal[] = []
const EMPTY_BROWSER_PANES: BrowserPaneType[] = []

export function WorkspaceView({ workspace, onEditWorkspace }: Props) {
  const [stats, setStats] = useState({ cpu: 0, ram_used: 0, ram_total: 0 })

  useEffect(() => {
    let active = true
    const updateStats = async () => {
      try {
        const s = await invoke<{ cpu: number, ram_used: number, ram_total: number }>('get_system_stats')
        if (active) setStats(s)
      } catch (err) {
        console.error('Failed to fetch system stats:', err)
      }
    }
    updateStats()
    const interval = setInterval(updateStats, 2000)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [])

  const terminals = useAppStore((s) => s.terminalsByWorkspace[workspace.id] ?? EMPTY_TERMINALS)
  const activeTerminalId = useAppStore((s) => s.activeTerminalId)
  const addTerminal = useAppStore((s) => s.addTerminal)
  const setActiveTerminalId = useAppStore((s) => s.setActiveTerminalId)
  const removeTerminal = useAppStore((s) => s.removeTerminal)
  const browserPanes = useAppStore((s) => s.browserPanesByWorkspace[workspace.id] ?? EMPTY_BROWSER_PANES)
  const addBrowserPane = useAppStore((s) => s.addBrowserPane)
  const removeBrowserPane = useAppStore((s) => s.removeBrowserPane)

  const handleAddTerminal = async (targetId?: string, direction?: 'horizontal' | 'vertical') => {
    try {
      const terminal = await invoke<Terminal>('spawn_terminal', {
        workspaceId: workspace.id,
        shell: 'zsh',
        cwd: '',
      })
      addTerminal(workspace.id, terminal, targetId, direction)
      setActiveTerminalId(terminal.id)
      useAppStore.getState().addToast('Terminal created', 'info')
    } catch (err) {
      console.error('spawn_terminal failed:', err)
      useAppStore.getState().addToast('Failed to spawn terminal', 'error')
    }
  }

  const handleCloseTerminal = async (terminalId: string) => {
    try {
      await invoke('close_terminal', { id: terminalId, scrollback: [] })
    } catch (err) {
      console.error('Failed to close terminal backend:', err)
    }
    removeTerminal(workspace.id, terminalId)
    useAppStore.getState().addToast('Terminal closed', 'info')
    // If the active terminal is closed, switch focus to another one in this workspace
    if (activeTerminalId === terminalId) {
      const remaining = terminals.filter((t) => t.id !== terminalId)
      if (remaining.length > 0) {
        setActiveTerminalId(remaining[remaining.length - 1].id)
      } else {
        setActiveTerminalId(null)
      }
    }
  }

  const handleAddBrowserPane = async (targetId?: string, direction?: 'horizontal' | 'vertical', initialUrl?: string) => {
    try {
      const pane = await invoke<BrowserPaneType>('create_browser_pane', {
        workspaceId: workspace.id,
        url: initialUrl || 'https://google.com',
        x: -10000, y: -10000, w: 800, h: 600,
      })
      addBrowserPane(workspace.id, pane, targetId, direction)
      setActiveTerminalId(pane.id)
      useAppStore.getState().addToast('Browser pane created', 'info')
    } catch (err) {
      console.error('create_browser_pane failed:', err)
      useAppStore.getState().addToast('Failed to create browser pane', 'error')
    }
  }

  const handleCloseBrowserPane = async (browserPaneId: string) => {
    try {
      await invoke('destroy_browser_pane', { id: browserPaneId })
      removeBrowserPane(workspace.id, browserPaneId)
      useAppStore.getState().addToast('Browser pane closed', 'info')
      if (activeTerminalId === browserPaneId) {
        const remaining = [...terminals, ...browserPanes].filter(p => p.id !== browserPaneId)
        setActiveTerminalId(remaining.length > 0 ? remaining[remaining.length - 1].id : null)
      }
    } catch (err) {
      console.error('destroy_browser_pane failed:', err)
      useAppStore.getState().addToast('Failed to close browser pane', 'error')
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <WorkspaceHeader
        workspace={workspace}
        terminals={terminals}
        activeTerminalId={activeTerminalId}
        onAddTerminal={() => handleAddTerminal()}
        onAddBrowserPane={() => handleAddBrowserPane()}
        onEditWorkspace={() => onEditWorkspace(workspace)}
        onSelectTerminal={setActiveTerminalId}
        onCloseTerminal={handleCloseTerminal}
      />
      {terminals.length > 0 || browserPanes.length > 0 ? (
        <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column' }}>
          <TerminalGrid
            workspaceId={workspace.id}
            terminals={terminals}
            activeTerminalId={activeTerminalId}
            onFocus={setActiveTerminalId}
            onClose={handleCloseTerminal}
            onSplit={(terminalId, direction) => handleAddTerminal(terminalId, direction)}
            onCloseBrowserPane={handleCloseBrowserPane}
            onSplitBrowserPane={(browserPaneId, direction, initialUrl) => handleAddBrowserPane(browserPaneId, direction, initialUrl)}
          />
          <div style={{ height: 26, background: 'var(--bg-main)', borderTop: '1px solid var(--border-inactive)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', fontSize: 9, fontFamily: 'SF Mono, Menlo, monospace', color: 'var(--text-dim)', letterSpacing: 0.5, flexShrink: 0 }}>
             <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                <span style={{ color: '#22c55e', display: 'flex', alignItems: 'center', gap: 6 }}><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg> CONNECTED <span style={{ color: '#4ade80' }}>vortex-01</span></span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="6" y1="3" x2="6" y2="15"></line><circle cx="18" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle><path d="M18 9a9 9 0 0 1-9 9"></path></svg> BRANCH <span style={{ color: 'var(--text-inactive)' }}>main*</span></span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect><rect x="9" y="9" width="6" height="6"></rect><line x1="9" y1="1" x2="9" y2="4"></line><line x1="15" y1="1" x2="15" y2="4"></line><line x1="9" y1="20" x2="9" y2="23"></line><line x1="15" y1="20" x2="15" y2="23"></line><line x1="20" y1="9" x2="23" y2="9"></line><line x1="20" y1="14" x2="23" y2="14"></line><line x1="1" y1="9" x2="4" y2="9"></line><line x1="1" y1="14" x2="4" y2="14"></line></svg> CPU <span style={{ color: 'var(--text-active)' }}>{stats.cpu.toFixed(1)}%</span></span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg> RAM <span style={{ color: 'var(--text-active)' }}>{stats.ram_used.toFixed(1)} / {stats.ram_total.toFixed(0)} GB</span></span>
             </div>
             <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"></path><path d="M1.42 9a16 16 0 0 1 21.16 0"></path><path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path><line x1="12" y1="20" x2="12.01" y2="20"></line></svg> <span style={{ color: 'var(--text-active)' }}>142 ms</span></span>
                <span>UTF-8</span>
                <span>{new Date().toLocaleTimeString('en-US', { hour12: false })}</span>
             </div>
          </div>
        </div>
      ) : (
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 16, background: 'var(--bg-main)'
        }}>
          <div style={{ fontSize: 48, opacity: 0.5 }}>{workspace.emoji}</div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <span style={{ color: 'var(--text-inactive)', fontSize: 16, fontWeight: 500, letterSpacing: 0.2 }}>Workspace is empty</span>
            <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>Spawn a terminal or browser to begin working</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button 
              onClick={() => handleAddTerminal()}
              style={{
                marginTop: 8, padding: '10px 20px', background: 'transparent',
                border: '1px dashed var(--border-inactive)', borderRadius: 8, color: 'var(--text-inactive)',
                fontSize: 14, fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--text-active)'
                e.currentTarget.style.borderColor = 'var(--text-inactive)'
                e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--text-inactive)'
                e.currentTarget.style.borderColor = 'var(--border-inactive)'
                e.currentTarget.style.background = 'transparent'
              }}
            >
              + New Terminal
            </button>
            <button 
              onClick={() => handleAddBrowserPane()}
              style={{
                marginTop: 8, padding: '10px 20px', background: 'transparent',
                border: '1px dashed var(--border-inactive)', borderRadius: 8, color: 'var(--text-inactive)',
                fontSize: 14, fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--text-active)'
                e.currentTarget.style.borderColor = 'var(--text-inactive)'
                e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--text-inactive)'
                e.currentTarget.style.borderColor = 'var(--border-inactive)'
                e.currentTarget.style.background = 'transparent'
              }}
            >
              🌐 New Browser
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
