import { useState, useEffect, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore } from '../../store/useAppStore'

interface Action {
  id: string
  label: string
  icon?: React.ReactNode
  onSelect: () => void
}

interface Props {
  onNewWorkspace: () => void
  onOpenSettings: () => void
  onNewTerminal: () => void
}

export function CommandPalette({ onNewWorkspace, onOpenSettings, onNewTerminal }: Props) {
  const isVisible = useAppStore(s => s.showCommandPalette)
  const setVisible = useAppStore(s => s.setShowCommandPalette)
  const workspaces = useAppStore(s => s.workspaces)
  const setActiveWorkspaceId = useAppStore(s => s.setActiveWorkspaceId)
  
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const actions = useMemo<Action[]>(() => {
    const defaultActions: Action[] = [
      {
        id: 'new-workspace',
        label: 'New Workspace',
        onSelect: onNewWorkspace,
        icon: <span style={{ fontSize: 16 }}>📦</span>
      },
      {
        id: 'new-terminal',
        label: 'New Terminal',
        onSelect: onNewTerminal,
        icon: <span style={{ fontSize: 16 }}>💻</span>
      },
      {
        id: 'open-settings',
        label: 'Settings',
        onSelect: onOpenSettings,
        icon: <span style={{ fontSize: 16 }}>⚙️</span>
      }
    ]

    const workspaceActions: Action[] = workspaces.map(ws => ({
      id: `workspace-${ws.id}`,
      label: `Go to Workspace: ${ws.name}`,
      icon: <span style={{ fontSize: 16 }}>{ws.emoji}</span>,
      onSelect: () => setActiveWorkspaceId(ws.id)
    }))

    return [...defaultActions, ...workspaceActions]
  }, [workspaces, onNewWorkspace, onNewTerminal, onOpenSettings, setActiveWorkspaceId])

  const filteredActions = useMemo(() => {
    if (!query.trim()) return actions
    const q = query.toLowerCase()
    return actions.filter(a => a.label.toLowerCase().includes(q))
  }, [actions, query])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  useEffect(() => {
    if (isVisible) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isVisible])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!isVisible) return
      if (e.key === 'Escape') {
        e.preventDefault()
        setVisible(false)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (filteredActions.length > 0) setSelectedIndex(i => (i + 1) % filteredActions.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (filteredActions.length > 0) setSelectedIndex(i => (i - 1 + filteredActions.length) % filteredActions.length)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (filteredActions[selectedIndex]) {
          filteredActions[selectedIndex].onSelect()
          setVisible(false)
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isVisible, filteredActions, selectedIndex, setVisible])

  if (!isVisible) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(4px)',
          zIndex: 9999,
          display: 'flex', justifyContent: 'center', paddingTop: '15vh'
        }}
        onClick={() => setVisible(false)}
      >
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          transition={{ duration: 0.15 }}
          style={{
            background: 'var(--bg-main)',
            border: '1px solid var(--border-inactive)',
            borderRadius: 12,
            boxShadow: '0 16px 64px rgba(0, 0, 0, 0.4)',
            width: 500,
            maxWidth: '90%',
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden'
          }}
          onClick={e => e.stopPropagation()}
        >
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-inactive)' }}>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Type a command or search..."
              style={{
                width: '100%', background: 'transparent', border: 'none',
                color: 'var(--text-active)', fontSize: 18, outline: 'none'
              }}
            />
          </div>
          <div style={{ maxHeight: 300, overflowY: 'auto', padding: 8 }}>
            {filteredActions.length === 0 ? (
              <div style={{ padding: '12px 20px', color: 'var(--text-inactive)', fontSize: 14 }}>
                No results found.
              </div>
            ) : (
              filteredActions.map((action, i) => {
                const isActive = i === selectedIndex
                return (
                  <div
                    key={action.id}
                    onClick={() => {
                      action.onSelect()
                      setVisible(false)
                    }}
                    onMouseEnter={() => setSelectedIndex(i)}
                    style={{
                      padding: '12px 16px',
                      borderRadius: 8,
                      display: 'flex', alignItems: 'center', gap: 12,
                      background: isActive ? 'var(--bg-hover)' : 'transparent',
                      color: isActive ? 'var(--text-active)' : 'var(--text-inactive)',
                      cursor: 'pointer',
                      transition: 'background 0.1s'
                    }}
                  >
                    {action.icon}
                    <span style={{ fontSize: 14, fontWeight: isActive ? 500 : 400 }}>{action.label}</span>
                  </div>
                )
              })
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
