import { useState } from 'react'
import { useAppStore, Settings } from '../../store/useAppStore'

interface Props {
  onClose: () => void
}

export function SettingsModal({ onClose }: Props) {
  const settings = useAppStore((s) => s.settings)
  const updateSettings = useAppStore((s) => s.updateSettings)

  const [theme, setTheme] = useState<Settings['theme']>(settings.theme)
  const [fontSize, setFontSize] = useState(settings.fontSize)

  function handleSave() {
    updateSettings({ theme, fontSize })
    onClose()
  }

  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
        background: 'rgba(0,0,0,0.5)', zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(2px)'
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-main)', border: '1px solid var(--border-inactive)',
          borderRadius: 8, padding: 24, width: 400,
          display: 'flex', flexDirection: 'column', gap: 16
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ fontSize: 18, color: 'var(--text-active)', marginBottom: 8 }}>Settings</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 13, color: 'var(--text-inactive)' }}>Theme</label>
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value as Settings['theme'])}
            style={{
              padding: '8px 12px', background: 'var(--bg-item)',
              border: '1px solid var(--border-inactive)', borderRadius: 4,
              color: 'var(--text-active)', outline: 'none', fontSize: 14
            }}
          >
            <option value="warm-dark">Warm Dark (Default)</option>
            <option value="cold-dark">Cold Dark</option>
            <option value="light">Light Mode</option>
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 13, color: 'var(--text-inactive)' }}>Terminal Font Size</label>
          <input
            type="number"
            min={8}
            max={48}
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
            style={{
              padding: '8px 12px', background: 'var(--bg-item)',
              border: '1px solid var(--border-inactive)', borderRadius: 4,
              color: 'var(--text-active)', outline: 'none', fontSize: 14
            }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px', background: 'transparent',
              border: '1px solid var(--border-inactive)', borderRadius: 4,
              color: 'var(--text-inactive)', cursor: 'pointer', fontSize: 13
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            style={{
              padding: '8px 16px', background: 'var(--accent)',
              border: 'none', borderRadius: 4,
              color: 'var(--bg-main)', cursor: 'pointer', fontSize: 13, fontWeight: 500
            }}
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  )
}
