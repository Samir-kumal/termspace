import { useState } from 'react'
import { Workspace } from '../../types'

interface Props {
  workspace: Workspace
  isActive: boolean
  canDelete: boolean
  isCollapsed?: boolean
  terminalCount: number
  onClick: () => void
  onDelete: () => void
  onContextMenu?: (e: React.MouseEvent) => void
}

export function WorkspaceItem({ workspace, isActive, canDelete, isCollapsed, terminalCount, onClick, onDelete, onContextMenu }: Props) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onClick={onClick}
      title={isCollapsed ? workspace.name : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onContextMenu={onContextMenu}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: isCollapsed ? 'center' : 'flex-start', gap: 10,
        padding: isCollapsed ? '8px 0' : '8px 12px', borderRadius: 6,
        borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
        background: isActive ? 'var(--bg-item-active)' : (hovered ? 'var(--bg-item)' : 'transparent'),
        color: isActive ? 'var(--text-active)' : 'var(--text-inactive)',
        fontWeight: isActive ? 500 : 400,
        fontSize: 13, cursor: 'pointer', transition: 'all 0.15s ease',
        position: 'relative',
      }}
    >
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <span style={{ fontSize: 16, flexShrink: 0 }}>{workspace.emoji}</span>
        {workspace.notificationCount && workspace.notificationCount > 0 && isCollapsed && (
          <span style={{
            position: 'absolute', top: -6, right: -8, background: '#ef4444', color: 'white',
            fontSize: 9, fontWeight: 'bold', padding: '1px 4px', borderRadius: 10,
            lineHeight: 1, minWidth: 14, textAlign: 'center', boxShadow: '0 0 0 2px var(--bg-sidebar)'
          }}>
            {workspace.notificationCount > 99 ? '99+' : workspace.notificationCount}
          </span>
        )}
      </div>
      {!isCollapsed && (
        <div style={{ display: 'flex', alignItems: 'center', flex: 1, overflow: 'hidden', gap: 6 }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {workspace.name}
          </span>
          {workspace.notificationCount && workspace.notificationCount > 0 && (
            <span style={{
              background: '#ef4444', color: 'white', fontSize: 10, fontWeight: 'bold',
              padding: '2px 6px', borderRadius: 10, lineHeight: 1, marginLeft: 'auto'
            }}>
              {workspace.notificationCount > 99 ? '99+' : workspace.notificationCount}
            </span>
          )}
          {(!workspace.notificationCount || workspace.notificationCount === 0) && terminalCount > 0 && (
            <span style={{ 
              fontSize: 10, background: isActive ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.06)', 
              color: isActive ? 'var(--text-active)' : 'var(--text-dim)',
              padding: '2px 6px', borderRadius: 10, fontWeight: 500, lineHeight: 1, marginLeft: 'auto'
            }}>
              {terminalCount}
            </span>
          )}
        </div>
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
