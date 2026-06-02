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
