import { useAppStore } from '../../store/useAppStore'
import { AddWorkspaceButton } from './AddWorkspaceButton'
import { WorkspaceItem } from './WorkspaceItem'
import { motion, AnimatePresence } from 'framer-motion'

interface Props {
  isCollapsed: boolean
  onToggleCollapse: () => void
  onAddWorkspace: () => void
  onSelectWorkspace: (id: string) => void
  onDeleteWorkspace: (id: string) => void
  onOpenSettings: () => void
}

export function WorkspaceSidebar({ isCollapsed, onToggleCollapse, onAddWorkspace, onSelectWorkspace, onDeleteWorkspace, onOpenSettings }: Props) {
  const workspaces = useAppStore((s) => s.workspaces)
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId)

  return (
    <div
      style={{
        width: '100%',
        height: '100%', background: 'var(--bg-sidebar)',
        display: 'flex', flexDirection: 'column', padding: '12px 10px', gap: 4,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: isCollapsed ? 'center' : 'space-between',
          padding: isCollapsed ? '0 0 12px' : '0 4px 12px',
        }}
      >
        {!isCollapsed && (
          <span style={{ 
            fontSize: 10, letterSpacing: 1, color: 'var(--text-inactive)', textTransform: 'uppercase',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 
          }}>
            Workspaces
          </span>
        )}
        <button
          onClick={onToggleCollapse}
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{
            background: 'none', border: 'none', color: 'var(--text-inactive)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 4, borderRadius: 4, flexShrink: 0,
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
          {isCollapsed ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 17l5-5-5-5M6 17l5-5-5-5"/></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 17l-5-5 5-5M18 17l-5-5 5-5"/></svg>
          )}
        </button>
      </div>

      <AnimatePresence>
        {workspaces.map((ws) => (
          <motion.div
            key={ws.id}
            layout
            initial={{ opacity: 0, height: 0, scale: 0.9 }}
            animate={{ opacity: 1, height: 'auto', scale: 1 }}
            exit={{ opacity: 0, height: 0, scale: 0.9 }}
            transition={{ duration: 0.2 }}
          >
            <WorkspaceItem
              workspace={ws}
              isActive={ws.id === activeWorkspaceId}
              canDelete={workspaces.length > 1}
              isCollapsed={isCollapsed}
              onClick={() => onSelectWorkspace(ws.id)}
              onDelete={() => onDeleteWorkspace(ws.id)}
            />
          </motion.div>
        ))}
      </AnimatePresence>
      <motion.div layout transition={{ duration: 0.2 }}>
        <AddWorkspaceButton onClick={onAddWorkspace} isCollapsed={isCollapsed} />
      </motion.div>

      <div style={{ flex: 1 }} />
      
      <button
        onClick={onOpenSettings}
        title={isCollapsed ? 'Settings' : undefined}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: isCollapsed ? 'center' : 'flex-start', gap: 10,
          padding: isCollapsed ? '8px 0' : '8px 12px', width: '100%', background: 'transparent',
          border: 'none', borderRadius: 6, color: 'var(--text-inactive)',
          cursor: 'pointer', fontSize: 13, textAlign: 'left',
          marginTop: 'auto', transition: 'all 0.15s ease'
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
        <span style={{ fontSize: 16, flexShrink: 0 }}>⚙</span> 
        {!isCollapsed && <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Settings</span>}
      </button>
    </div>
  )
}

