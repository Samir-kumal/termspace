import { invoke } from '@tauri-apps/api/core'
import { useAppStore } from '../../store/useAppStore'
import { Workspace, Terminal } from '../../types'
import { TerminalGrid } from './TerminalGrid'
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

  const handleAddTerminal = async () => {
    if (terminals.length >= 4) return
    try {
      const terminal = await invoke<Terminal>('spawn_terminal', {
        workspaceId: workspace.id,
        shell: 'zsh',
        cwd: '',
      })
      addTerminal(workspace.id, terminal)
      setActiveTerminalId(terminal.id)
    } catch (err) {
      console.error('spawn_terminal failed:', err)
    }
  }

  const handleCloseTerminal = (terminalId: string) => {
    removeTerminal(workspace.id, terminalId)
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
        onAddTerminal={handleAddTerminal}
        onEditWorkspace={() => onEditWorkspace(workspace)}
      />
      <TerminalGrid
        workspaceId={workspace.id}
        terminals={terminals}
        activeTerminalId={activeTerminalId}
        onFocus={setActiveTerminalId}
        onClose={handleCloseTerminal}
      />
    </div>
  )
}
