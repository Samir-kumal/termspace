import { motion } from 'framer-motion'

interface Props {
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  isDestructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({ 
  title, 
  message, 
  confirmText = 'Confirm', 
  cancelText = 'Cancel', 
  isDestructive = false,
  onConfirm, 
  onCancel 
}: Props) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
        background: 'rgba(0,0,0,0.5)', zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(2px)'
      }}
      onClick={onCancel}
    >
      <motion.div
        initial={{ opacity: 0, y: 15, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 15, scale: 0.98 }}
        style={{
          background: 'var(--bg-main)', border: '1px solid var(--border-inactive)',
          borderRadius: 8, padding: 24, width: 400,
          display: 'flex', flexDirection: 'column', gap: 16
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ fontSize: 18, color: 'var(--text-active)', marginBottom: 4 }}>{title}</h2>
        
        <p style={{ fontSize: 14, color: 'var(--text-inactive)', lineHeight: 1.5 }}>
          {message}
        </p>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button
            onClick={onCancel}
            style={{
              padding: '8px 16px', background: 'transparent',
              border: '1px solid var(--border-inactive)', borderRadius: 4,
              color: 'var(--text-inactive)', cursor: 'pointer', fontSize: 13
            }}
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: '8px 16px', 
              background: isDestructive ? '#e07b7b' : 'var(--accent)',
              border: 'none', borderRadius: 4,
              color: isDestructive ? '#ffffff' : 'var(--bg-main)', 
              cursor: 'pointer', fontSize: 13, fontWeight: 500
            }}
          >
            {confirmText}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
