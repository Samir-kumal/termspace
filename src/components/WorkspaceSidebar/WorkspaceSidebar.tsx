import { useAppStore } from '../../store/useAppStore'
import { AddWorkspaceButton } from './AddWorkspaceButton'
import { WorkspaceItem } from './WorkspaceItem'

interface Props {
  onAddWorkspace: () => void
  onSelectWorkspace: (id: string) => void
}

export function WorkspaceSidebar({ onAddWorkspace, onSelectWorkspace }: Props) {
  const workspaces = useAppStore((s) => s.workspaces)
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId)

  return (
    <div
      style={{
        width: 'var(--sidebar-width)', minWidth: 'var(--sidebar-width)',
        height: '100%', background: 'var(--bg-sidebar)',
        borderRight: '1px solid var(--border-inactive)',
        display: 'flex', flexDirection: 'column', padding: 8, gap: 2,
      }}
    >
      <div
        style={{
          fontSize: 10, letterSpacing: 1, color: 'var(--text-dim)',
          padding: '4px 10px 8px', textTransform: 'uppercase',
        }}
      >
        Workspaces
      </div>
      {workspaces.map((ws) => (
        <WorkspaceItem
          key={ws.id}
          workspace={ws}
          isActive={ws.id === activeWorkspaceId}
          onClick={() => onSelectWorkspace(ws.id)}
        />
      ))}
      <AddWorkspaceButton onClick={onAddWorkspace} />
    </div>
  )
}
