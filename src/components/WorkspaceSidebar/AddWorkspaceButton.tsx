interface Props {
  isCollapsed?: boolean
  onClick: () => void 
}

export function AddWorkspaceButton({ isCollapsed, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      aria-label="new workspace"
      title={isCollapsed ? "New workspace" : undefined}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: isCollapsed ? 'center' : 'flex-start',
        gap: 8, width: '100%',
        padding: isCollapsed ? '8px 0' : '8px 12px', background: 'none',
        border: '1px dashed var(--border-inactive)', borderRadius: 6,
        cursor: 'pointer', color: 'var(--text-inactive)', fontSize: 13,
        marginTop: 6, transition: 'all 0.15s ease'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = 'var(--text-active)'
        e.currentTarget.style.borderColor = 'var(--text-inactive)'
        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = 'var(--text-inactive)'
        e.currentTarget.style.borderColor = 'var(--border-inactive)'
        e.currentTarget.style.background = 'none'
      }}
    >
      <span style={{ fontSize: 16, flexShrink: 0 }}>+</span>
      {!isCollapsed && <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>New workspace</span>}
    </button>
  )
}
