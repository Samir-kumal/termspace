import { useState } from 'react'
import { Workspace } from '../../types'

interface Props {
  workspace: Workspace
  isActive: boolean
  canDelete: boolean
  onClick: () => void
  onDelete: () => void
}

export function WorkspaceItem({ workspace, isActive, canDelete, onClick, onDelete }: Props) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 10px', borderRadius: 4,
        borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
        background: isActive ? 'var(--bg-item-active)' : 'transparent',
        color: isActive ? 'var(--text-active)' : 'var(--text-inactive)',
        fontSize: 13, cursor: 'pointer', transition: 'background 0.1s',
        position: 'relative',
      }}
    >
      <span style={{ fontSize: 16 }}>{workspace.emoji}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
        {workspace.name}
      </span>
      {hovered && canDelete && (
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
