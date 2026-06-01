import { Workspace, Terminal } from '../../types'

interface Props {
  workspace: Workspace
  terminals: Terminal[]
  activeTerminalId: string | null
  onAddTerminal: () => void
  onAddBrowserPane: () => void
  onEditWorkspace: () => void
  onSelectTerminal: (id: string) => void
  onCloseTerminal: (id: string) => void
}

export function WorkspaceHeader({ workspace, terminals, activeTerminalId, onAddTerminal, onAddBrowserPane, onEditWorkspace, onSelectTerminal, onCloseTerminal }: Props) {
  return (
    <div
      style={{
        height: 52, display: 'flex', alignItems: 'center',
        padding: '0 16px', borderBottom: '1px solid var(--border-inactive)',
        gap: 16, flexShrink: 0, background: 'var(--bg-main)'
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
      <span style={{ fontSize: 12, color: 'var(--text-dim)', fontWeight: 500 }}>
        {terminals.length}/4
      </span>

      <div style={{ flex: 1, display: 'flex', gap: 6, overflowX: 'auto', padding: '0 16px', alignItems: 'center' }}>
        {terminals.length > 1 && terminals.map((t, idx) => {
          const isActive = t.id === activeTerminalId
          return (
            <div
              key={t.id}
              onClick={() => onSelectTerminal(t.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px',
                borderRadius: 6, background: isActive ? 'var(--bg-item-active)' : 'transparent',
                color: isActive ? 'var(--text-active)' : 'var(--text-inactive)',
                border: isActive ? '1px solid rgba(255, 255, 255, 0.05)' : '1px solid transparent',
                cursor: 'pointer', transition: 'all 0.15s ease', minWidth: 80, maxWidth: 140,
                boxShadow: isActive ? '0 2px 8px rgba(0,0,0,0.2)' : 'none'
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.background = 'var(--bg-item)'
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.background = 'transparent'
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}>
                <polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line>
              </svg>
              <span style={{ fontSize: 12, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                Term {idx + 1}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); onCloseTerminal(t.id); }}
                style={{
                  background: 'transparent', border: 'none', color: 'inherit',
                  opacity: 0.5, cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center'
                }}
                onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                onMouseLeave={(e) => e.currentTarget.style.opacity = '0.5'}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          )
        })}
      </div>

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
      <button
        onClick={onAddBrowserPane}
        style={{
          padding: '6px 14px', background: 'transparent',
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
        <span style={{ fontSize: 14 }}>🌐</span> Browser
      </button>
    </div>
  )
}
