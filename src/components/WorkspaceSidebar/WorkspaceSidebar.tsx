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
  onEditWorkspace: (id: string) => void
  onOpenSettings: () => void
}

export function WorkspaceSidebar({ isCollapsed, onToggleCollapse, onAddWorkspace, onSelectWorkspace, onDeleteWorkspace, onEditWorkspace, onOpenSettings }: Props) {
  const workspaces = useAppStore((s) => s.workspaces)
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId)
  const terminalsByWorkspace = useAppStore((s) => s.terminalsByWorkspace)
  const showContextMenu = useAppStore((s) => s.showContextMenu)

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

      <AnimatePresence initial={false}>
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
              terminalCount={terminalsByWorkspace[ws.id]?.length || 0}
              onClick={() => onSelectWorkspace(ws.id)}
              onDelete={() => onDeleteWorkspace(ws.id)}
              onContextMenu={(e) => {
                e.preventDefault()
                showContextMenu(e.clientX, e.clientY, [
                  {
                    label: 'Rename & Edit',
                    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>,
                    onClick: () => onEditWorkspace(ws.id)
                  },
                  { separator: true, label: '', onClick: () => {} },
                  {
                    label: 'Delete Workspace',
                    danger: true,
                    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>,
                    onClick: () => onDeleteWorkspace(ws.id)
                  }
                ])
              }}
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

