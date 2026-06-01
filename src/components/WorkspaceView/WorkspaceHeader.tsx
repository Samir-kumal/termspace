import { Workspace, Terminal } from '../../types'

interface Props {
  workspace: Workspace
  terminals: Terminal[]
  onAddTerminal: () => void
  onEditWorkspace: () => void
}

export function WorkspaceHeader({ workspace, terminals, onAddTerminal, onEditWorkspace }: Props) {
  return (
    <div
      style={{
        height: 52, display: 'flex', alignItems: 'center',
        padding: '0 16px', borderBottom: '1px solid var(--border-inactive)',
        gap: 10, flexShrink: 0, background: 'var(--bg-main)'
      }}
    >
      <span style={{ fontSize: 18 }}>{workspace.emoji}</span>
      <span
        style={{ fontSize: 14, color: 'var(--text-active)', fontWeight: 600, cursor: 'pointer', letterSpacing: 0.2 }}
        onClick={onEditWorkspace}
        title="Click to edit"
      >
        {workspace.name}
      </span>
      <span style={{ fontSize: 12, color: 'var(--text-dim)', marginLeft: 4, fontWeight: 500 }}>
        {terminals.length}/4
      </span>
      {terminals.length < 4 && (
        <button
          onClick={onAddTerminal}
          style={{
            marginLeft: 'auto', padding: '6px 14px', background: 'transparent',
            border: '1px dashed var(--border-inactive)', borderRadius: 6,
            color: 'var(--text-inactive)', fontSize: 12, fontWeight: 500, cursor: 'pointer',
            transition: 'all 0.2s ease', display: 'flex', alignItems: 'center', gap: 6
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--text-active)'
            e.currentTarget.style.borderColor = 'var(--text-inactive)'
            e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--text-inactive)'
            e.currentTarget.style.borderColor = 'var(--border-inactive)'
            e.currentTarget.style.background = 'transparent'
          }}
        >
          <span style={{ fontSize: 14 }}>+</span> Terminal
        </button>
      )}
    </div>
  )
}
