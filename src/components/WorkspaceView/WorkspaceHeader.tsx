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
        height: 40, display: 'flex', alignItems: 'center',
        padding: '0 12px', borderBottom: '1px solid var(--border-inactive)',
        gap: 8, flexShrink: 0,
      }}
    >
      <span style={{ fontSize: 16 }}>{workspace.emoji}</span>
      <span
        style={{ fontSize: 13, color: 'var(--text-active)', fontWeight: 500, cursor: 'pointer' }}
        onClick={onEditWorkspace}
        title="Click to edit"
      >
        {workspace.name}
      </span>
      <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 2 }}>
        {terminals.length}/4
      </span>
      {terminals.length < 4 && (
        <button
          onClick={onAddTerminal}
          style={{
            marginLeft: 'auto', padding: '3px 10px', background: 'none',
            border: '1px solid var(--border-inactive)', borderRadius: 4,
            color: 'var(--text-inactive)', fontSize: 11, cursor: 'pointer',
          }}
        >
          + terminal
        </button>
      )}
    </div>
  )
}
