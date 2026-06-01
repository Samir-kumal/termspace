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
        gap: 6, width: '100%',
        padding: isCollapsed ? '7px 0' : '7px 10px', background: 'none',
        border: '1px dashed var(--border-inactive)', borderRadius: 4,
        cursor: 'pointer', color: 'var(--text-inactive)', fontSize: 12,
        marginTop: 'auto',
      }}
    >
      <span style={{ fontSize: 14, flexShrink: 0 }}>+</span>
      {!isCollapsed && <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>New workspace</span>}
    </button>
  )
}
