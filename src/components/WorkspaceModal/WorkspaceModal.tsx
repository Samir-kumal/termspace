import { useState } from 'react'
import { motion } from 'framer-motion'
import { Workspace } from '../../types'

const EMOJIS = ['💻', '🔥', '🌿', '⚡', '🚀', '🎯', '🛠️', '📦', '🔬', '🌊']
const COLORS = ['#e8a045', '#4fc3a1', '#7b9ef0', '#e07b7b', '#b17dd4', '#e8d045']

interface Props {
  initial?: Pick<Workspace, 'name' | 'emoji' | 'color'>
  onSave: (values: { name: string; emoji: string; color: string }) => void
  onCancel: () => void
}

export function WorkspaceModal({ initial, onSave, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? '')
  const [emoji, setEmoji] = useState(initial?.emoji ?? '💻')
  const [color, setColor] = useState(initial?.color ?? '#e8a045')

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
      }}
      onClick={onCancel}
    >
      <motion.div
        initial={{ opacity: 0, y: 15, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 15, scale: 0.98 }}
        style={{
          background: 'var(--bg-sidebar)', border: '1px solid var(--border-inactive)',
          borderRadius: 8, padding: 24, minWidth: 320,
          display: 'flex', flexDirection: 'column', gap: 16,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ color: 'var(--text-active)', fontSize: 15 }}>
          {initial ? 'Edit workspace' : 'New workspace'}
        </h3>

        <input
          placeholder="Workspace name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          style={{
            background: 'var(--bg-main)', border: '1px solid var(--border-inactive)',
            borderRadius: 4, padding: '8px 10px', color: 'var(--text-active)',
            fontSize: 13, outline: 'none',
          }}
        />

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {EMOJIS.map((e) => (
            <button
              key={e}
              onClick={() => setEmoji(e)}
              style={{
                fontSize: 18, background: 'none', cursor: 'pointer', padding: 4, borderRadius: 4,
                border: emoji === e ? '1px solid var(--accent)' : '1px solid transparent',
              }}
            >
              {e}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              style={{
                width: 24, height: 24, borderRadius: '50%', background: c, cursor: 'pointer',
                border: color === c ? '2px solid white' : '2px solid transparent',
              }}
            />
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            aria-label="cancel"
            onClick={onCancel}
            style={{
              padding: '6px 14px', background: 'none',
              border: '1px solid var(--border-inactive)', borderRadius: 4,
              color: 'var(--text-inactive)', cursor: 'pointer', fontSize: 13,
            }}
          >
            Cancel
          </button>
          <button
            aria-label={initial ? 'save' : 'create'}
            onClick={() => name.trim() && onSave({ name: name.trim(), emoji, color })}
            style={{
              padding: '6px 14px', background: 'var(--accent)', border: 'none',
              borderRadius: 4, color: '#1a1612', cursor: 'pointer', fontSize: 13, fontWeight: 600,
            }}
          >
            {initial ? 'Save' : 'Create'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
