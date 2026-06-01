import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export interface ContextMenuItem {
  label: string
  icon?: React.ReactNode
  onClick: () => void
  danger?: boolean
  separator?: boolean
}

interface ContextMenuProps {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [onClose])

  // Prevent menu from going off-screen
  const menuWidth = 200
  const menuHeight = items.length * 36 + 16 // rough estimate
  
  const safeX = x + menuWidth > window.innerWidth ? x - menuWidth : x
  const safeY = y + menuHeight > window.innerHeight ? window.innerHeight - menuHeight - 16 : y

  return (
    <AnimatePresence>
      <motion.div
        ref={menuRef}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.1 }}
        style={{
          position: 'fixed',
          top: safeY,
          left: safeX,
          width: menuWidth,
          background: 'var(--bg-main)',
          border: '1px solid var(--border-inactive)',
          borderRadius: 8,
          padding: '4px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {items.map((item, i) => {
          if (item.separator) {
            return (
              <div key={`sep-${i}`} style={{ height: 1, background: 'var(--border-inactive)', margin: '4px 0' }} />
            )
          }

          return (
            <button
              key={i}
              onClick={() => {
                item.onClick()
                onClose()
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                padding: '8px 12px',
                background: 'transparent',
                border: 'none',
                borderRadius: 4,
                color: item.danger ? '#ff6b6b' : 'var(--text-active)',
                fontSize: 13,
                cursor: 'pointer',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = item.danger ? 'rgba(255, 107, 107, 0.1)' : 'var(--bg-hover)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
              }}
            >
              {item.icon && (
                <span style={{ display: 'flex', alignItems: 'center', opacity: 0.7 }}>
                  {item.icon}
                </span>
              )}
              {item.label}
            </button>
          )
        })}
      </motion.div>
    </AnimatePresence>
  )
}
