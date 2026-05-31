import { useState } from 'react'
import { Terminal as TerminalType } from '../../types'
import { TerminalPane } from './TerminalPane'

interface Props {
  workspaceId: string
  terminals: TerminalType[]
  activeTerminalId: string | null
  onFocus: (terminalId: string) => void
  onClose: (terminalId: string) => void
}

export function TerminalGrid({ workspaceId, terminals, activeTerminalId, onFocus, onClose }: Props) {
  const [maximizedTerminalId, setMaximizedTerminalId] = useState<string | null>(null)

  if (terminals.length === 0) return null

  const isMaximized = maximizedTerminalId !== null
  const displayCount = isMaximized ? 1 : terminals.length

  return (
    <div
      style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: displayCount === 1 ? '1fr' : '1fr 1fr',
        gridTemplateRows: displayCount <= 2 ? '1fr' : '1fr 1fr',
        gap: 4,
        padding: 6,
        overflow: 'hidden',
      }}
    >
      {terminals.map((t) => (
        <div
          key={t.id}
          style={{
            display: isMaximized && maximizedTerminalId !== t.id ? 'none' : 'flex',
            width: '100%',
            height: '100%',
            minWidth: 0,
            minHeight: 0,
          }}
        >
          <TerminalPane
            terminalId={t.id}
            workspaceId={workspaceId}
            isActive={t.id === activeTerminalId}
            scrollback={t.scrollback}
            isMaximized={maximizedTerminalId === t.id}
            onFocus={() => onFocus(t.id)}
            onToggleMaximize={() => setMaximizedTerminalId(maximizedTerminalId === t.id ? null : t.id)}
            onClose={() => {
              if (maximizedTerminalId === t.id) setMaximizedTerminalId(null)
              onClose(t.id)
            }}
          />
        </div>
      ))}
    </div>
  )
}
