import { useAppStore } from '../../store/useAppStore'
import { AddWorkspaceButton } from './AddWorkspaceButton'
import { WorkspaceItem } from './WorkspaceItem'

interface Props {
  onAddWorkspace: () => void
  onSelectWorkspace: (id: string) => void
  onDeleteWorkspace: (id: string) => void
  onOpenSettings: () => void
}

export function WorkspaceSidebar({ onAddWorkspace, onSelectWorkspace, onDeleteWorkspace, onOpenSettings }: Props) {
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
          fontSize: 10, letterSpacing: 1, color: 'var(--text-inactive)',
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
          canDelete={workspaces.length > 1}
          onClick={() => onSelectWorkspace(ws.id)}
          onDelete={() => onDeleteWorkspace(ws.id)}
        />
      ))}
      <AddWorkspaceButton onClick={onAddWorkspace} />

      <div style={{ flex: 1 }} />
      
      <button
        onClick={onOpenSettings}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 10px', width: '100%', background: 'transparent',
          border: 'none', borderRadius: 6, color: 'var(--text-inactive)',
          cursor: 'pointer', fontSize: 13, textAlign: 'left',
          marginTop: 'auto'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--bg-item)'
          e.currentTarget.style.color = 'var(--text-active)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.color = 'var(--text-inactive)'
        }}
      >
        <span style={{ fontSize: 16 }}>⚙</span> Settings
      </button>
    </div>
  )
}

