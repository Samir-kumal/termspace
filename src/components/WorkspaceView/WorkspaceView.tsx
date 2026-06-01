import { invoke } from '@tauri-apps/api/core'
import { useAppStore } from '../../store/useAppStore'
import { Workspace, Terminal } from '../../types'
import { TerminalGrid } from './TerminalGrid'
import { TerminalTabsOverlay } from './TerminalTabsOverlay'
import { WorkspaceHeader } from './WorkspaceHeader'

interface Props {
  workspace: Workspace
  onEditWorkspace: (workspace: Workspace) => void
}

// Stable reference — prevents Zustand infinite re-render when no terminals exist yet
const EMPTY_TERMINALS: Terminal[] = []

export function WorkspaceView({ workspace, onEditWorkspace }: Props) {
  const terminals = useAppStore((s) => s.terminalsByWorkspace[workspace.id] ?? EMPTY_TERMINALS)
  const activeTerminalId = useAppStore((s) => s.activeTerminalId)
  const addTerminal = useAppStore((s) => s.addTerminal)
  const setActiveTerminalId = useAppStore((s) => s.setActiveTerminalId)
  const removeTerminal = useAppStore((s) => s.removeTerminal)

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

  const handleCloseTerminal = (terminalId: string) => {
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

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <WorkspaceHeader
        workspace={workspace}
        terminals={terminals}
        onAddTerminal={() => handleAddTerminal()}
        onEditWorkspace={() => onEditWorkspace(workspace)}
      />
      {terminals.length > 0 ? (
        <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column' }}>
          <TerminalGrid
            workspaceId={workspace.id}
            terminals={terminals}
            activeTerminalId={activeTerminalId}
            onFocus={setActiveTerminalId}
            onClose={handleCloseTerminal}
            onSplit={(terminalId, direction) => handleAddTerminal(terminalId, direction)}
          />
          <TerminalTabsOverlay
            terminals={terminals}
            activeTerminalId={activeTerminalId}
            onSelectTerminal={setActiveTerminalId}
            onCloseTerminal={handleCloseTerminal}
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
            <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>Spawn a terminal to begin working</span>
          </div>
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
        </div>
      )}
    </div>
  )
}
