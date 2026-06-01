import { useState } from 'react'
import { motion } from 'framer-motion'
import { useAppStore, Settings } from '../../store/useAppStore'

interface Props {
  onClose: () => void
}

export function SettingsModal({ onClose }: Props) {
  const settings = useAppStore((s) => s.settings)
  const updateSettings = useAppStore((s) => s.updateSettings)

  const [theme, setTheme] = useState<Settings['theme']>(settings.theme)
  const [fontSize, setFontSize] = useState(settings.fontSize)
  const [keybindings, setKeybindings] = useState(settings.keybindings || {
    newTerminal: 'CmdOrCtrl+T',
    closeTerminal: 'CmdOrCtrl+W',
    nextTerminal: 'CmdOrCtrl+Shift+]',
    prevTerminal: 'CmdOrCtrl+Shift+[',
    commandPalette: 'CmdOrCtrl+K',
  })

  function handleSave() {
    updateSettings({ theme, fontSize, keybindings })
    useAppStore.getState().addToast('Settings saved', 'success')
    onClose()
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
        background: 'rgba(0,0,0,0.6)', zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(4px)'
      }}
      onClick={onClose}
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
        <h2 style={{ fontSize: 18, color: 'var(--text-active)', marginBottom: 4, fontWeight: 600, marginTop: 0 }}>Settings</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 13, color: 'var(--text-inactive)', fontWeight: 500 }}>Theme</label>
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value as Settings['theme'])}
            style={{
              padding: '10px 14px', background: 'var(--bg-sidebar)',
              border: '1px solid var(--border-inactive)', borderRadius: 6,
              color: 'var(--text-active)', outline: 'none', fontSize: 14,
              transition: 'border 0.2s', width: '100%'
            }}
            onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
            onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-inactive)'}
          >
            <option value="warm-dark">Warm Dark (Default)</option>
            <option value="cold-dark">Cold Dark</option>
            <option value="light">Light Mode</option>
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 13, color: 'var(--text-inactive)', fontWeight: 500 }}>Terminal Font Size</label>
          <input
            type="number"
            min={8}
            max={48}
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
            style={{
              padding: '10px 14px', background: 'var(--bg-sidebar)',
              border: '1px solid var(--border-inactive)', borderRadius: 6,
              color: 'var(--text-active)', outline: 'none', fontSize: 14,
              transition: 'border 0.2s', width: '100%'
            }}
            onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
            onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-inactive)'}
          />
        </div>

        <div style={{ borderTop: '1px solid var(--border-inactive)', margin: '10px 0' }} />

        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-active)' }}>Keybindings</div>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {(Object.keys(keybindings) as (keyof typeof keybindings)[]).map((key) => (
            <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 13, color: 'var(--text-inactive)', fontWeight: 500 }}>
                {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
              </label>
              <input
                type="text"
                value={keybindings[key]}
                onChange={(e) => setKeybindings({ ...keybindings, [key]: e.target.value })}
                style={{
                  padding: '8px 12px', background: 'var(--bg-sidebar)',
                  border: '1px solid var(--border-inactive)', borderRadius: 6,
                  color: 'var(--text-active)', outline: 'none', fontSize: 13,
                  transition: 'border 0.2s', width: '100%'
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
                onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-inactive)'}
              />
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px', background: 'transparent',
              border: '1px solid var(--border-inactive)', borderRadius: 6,
              color: 'var(--text-inactive)', cursor: 'pointer', fontSize: 14, fontWeight: 500,
              transition: 'background 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-item)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            style={{
              padding: '8px 16px', background: 'var(--accent)',
              border: 'none', borderRadius: 6,
              color: 'var(--bg-main)', cursor: 'pointer', fontSize: 14, fontWeight: 600,
              transition: 'opacity 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.opacity = '0.8'}
            onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
          >
            Save Changes
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
