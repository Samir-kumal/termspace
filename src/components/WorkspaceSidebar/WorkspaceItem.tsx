import { useState } from 'react'
import { Workspace } from '../../types'

interface Props {
  workspace: Workspace
  isActive: boolean
  canDelete: boolean
  isCollapsed?: boolean
  onClick: () => void
  onDelete: () => void
}

export function WorkspaceItem({ workspace, isActive, canDelete, isCollapsed, onClick, onDelete }: Props) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onClick={onClick}
      title={isCollapsed ? workspace.name : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: isCollapsed ? 'center' : 'flex-start', gap: 8,
        padding: isCollapsed ? '7px 0' : '7px 10px', borderRadius: 4,
        borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
        background: isActive ? 'var(--bg-item-active)' : 'transparent',
        color: isActive ? 'var(--text-active)' : 'var(--text-inactive)',
        fontSize: 13, cursor: 'pointer', transition: 'background 0.1s',
        position: 'relative',
      }}
    >
      <span style={{ fontSize: 16, flexShrink: 0 }}>{workspace.emoji}</span>
      {!isCollapsed && (
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {workspace.name}
        </span>
      )}
      {!isCollapsed && hovered && canDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          title="Delete workspace"
          style={{
            marginLeft: 'auto', padding: '1px 5px', background: 'none',
            border: 'none', borderRadius: 3, color: 'var(--text-inactive)',
            fontSize: 14, cursor: 'pointer', lineHeight: 1,
            opacity: 0.6,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.6')}
        >
          ×
        </button>
      )}
    </div>
  )
}
