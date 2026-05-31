import { Workspace } from '../../types'

interface Props {
  workspace: Workspace
  isActive: boolean
  onClick: () => void
}

export function WorkspaceItem({ workspace, isActive, onClick }: Props) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 10px', borderRadius: 4,
        borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
        background: isActive ? 'var(--bg-item-active)' : 'transparent',
        color: isActive ? 'var(--text-active)' : 'var(--text-inactive)',
        fontSize: 13, cursor: 'pointer', transition: 'background 0.1s',
      }}
    >
      <span style={{ fontSize: 16 }}>{workspace.emoji}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {workspace.name}
      </span>
    </div>
  )
}
