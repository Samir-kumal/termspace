interface Props { onClick: () => void }

export function AddWorkspaceButton({ onClick }: Props) {
  return (
    <button
      onClick={onClick}
      aria-label="new workspace"
      style={{
        display: 'flex', alignItems: 'center', gap: 6, width: '100%',
        padding: '7px 10px', background: 'none',
        border: '1px dashed var(--border-inactive)', borderRadius: 4,
        cursor: 'pointer', color: 'var(--text-dim)', fontSize: 12,
        marginTop: 'auto',
      }}
    >
      <span style={{ fontSize: 14 }}>+</span>
      <span>New workspace</span>
    </button>
  )
}
