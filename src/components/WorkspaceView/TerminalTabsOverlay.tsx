import { motion } from 'framer-motion'
import { Terminal } from '../../types'

interface Props {
  terminals: Terminal[]
  activeTerminalId: string | null
  onSelectTerminal: (id: string) => void
  onCloseTerminal: (id: string) => void
}

export function TerminalTabsOverlay({ terminals, activeTerminalId, onSelectTerminal, onCloseTerminal }: Props) {
  if (terminals.length <= 1) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      style={{
        position: 'absolute',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: 'rgba(30, 30, 30, 0.65)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        padding: '6px',
        borderRadius: 12,
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
        zIndex: 50,
      }}
    >
      {terminals.map((t, idx) => {
        const isActive = t.id === activeTerminalId
        return (
          <div
            key={t.id}
            onClick={() => onSelectTerminal(t.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 12px',
              borderRadius: 8,
              background: isActive ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
              color: isActive ? 'var(--text-active)' : 'var(--text-inactive)',
              cursor: 'pointer',
              transition: 'all 0.2s',
              minWidth: 100,
              maxWidth: 160,
            }}
            onMouseEnter={(e) => {
              if (!isActive) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'
            }}
            onMouseLeave={(e) => {
              if (!isActive) e.currentTarget.style.background = 'transparent'
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}>
              <polyline points="4 17 10 11 4 5"></polyline>
              <line x1="12" y1="19" x2="20" y2="19"></line>
            </svg>
            <span style={{ fontSize: 13, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Term {idx + 1}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onCloseTerminal(t.id)
              }}
              style={{
                background: 'transparent', border: 'none', color: 'inherit',
                opacity: 0.5, cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center'
              }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
              onMouseLeave={(e) => e.currentTarget.style.opacity = '0.5'}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        )
      })}
    </motion.div>
  )
}
