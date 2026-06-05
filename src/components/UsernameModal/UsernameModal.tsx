import { useState } from 'react'
import { motion } from 'framer-motion'
import { UserCircle } from 'lucide-react'

interface Props {
  onSave: (name: string) => void
}

export function UsernameModal({ onSave }: Props) {
  const [name, setName] = useState('')

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
        backdropFilter: 'blur(4px)'
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 15, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 15, scale: 0.98 }}
        style={{
          background: 'var(--bg-main)', border: '1px solid var(--border-inactive)',
          borderRadius: 12, padding: 32, width: 400, maxWidth: '90%',
          display: 'flex', flexDirection: 'column', gap: 20,
          boxShadow: '0 16px 40px rgba(0,0,0,0.2)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 8,
            background: 'var(--bg-item-active)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', color: 'var(--accent)'
          }}>
            <UserCircle size={24} />
          </div>
          <div>
            <h3 style={{ color: 'var(--text-active)', fontSize: 18, fontWeight: 600, margin: 0 }}>
              Welcome to Vibecode
            </h3>
            <p style={{ color: 'var(--text-dim)', fontSize: 13, margin: '4px 0 0 0' }}>
              Let's get started by setting up your profile.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 13, color: 'var(--text-inactive)', fontWeight: 500 }}>Your Name</label>
          <input
            placeholder="e.g., Jane Doe"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim()) {
                onSave(name.trim())
              }
            }}
            autoFocus
            style={{
              background: 'var(--bg-sidebar)', border: '1px solid var(--border-inactive)',
              borderRadius: 6, padding: '10px 14px', color: 'var(--text-active)',
              fontSize: 14, outline: 'none', transition: 'border 0.2s', width: '100%',
              boxSizing: 'border-box'
            }}
            onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
            onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-inactive)'}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
          <button
            aria-label="continue"
            onClick={() => name.trim() && onSave(name.trim())}
            disabled={!name.trim()}
            style={{
              padding: '8px 16px', background: 'var(--accent)',
              border: 'none', borderRadius: 6,
              color: 'var(--bg-main)', cursor: name.trim() ? 'pointer' : 'not-allowed', 
              fontSize: 14, fontWeight: 600, opacity: name.trim() ? 1 : 0.5,
              transition: 'opacity 0.2s'
            }}
          >
            Continue
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
