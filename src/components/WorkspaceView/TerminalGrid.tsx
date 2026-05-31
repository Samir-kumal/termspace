import { Terminal as TerminalType } from '../../types'
import { TerminalPane } from './TerminalPane'

interface Props {
  workspaceId: string
  terminals: TerminalType[]
  activeTerminalId: string | null
  onFocus: (terminalId: string) => void
}

export function TerminalGrid({ workspaceId, terminals, activeTerminalId, onFocus }: Props) {
  if (terminals.length === 0) return null

  const count = terminals.length

  return (
    <div
      style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: count === 1 ? '1fr' : '1fr 1fr',
        gridTemplateRows: count <= 2 ? '1fr' : '1fr 1fr',
        gap: 4,
        padding: 6,
        overflow: 'hidden',
      }}
    >
      {terminals.map((t) => (
        <TerminalPane
          key={t.id}
          terminalId={t.id}
          workspaceId={workspaceId}
          isActive={t.id === activeTerminalId}
          scrollback={t.scrollback}
          onFocus={() => onFocus(t.id)}
        />
      ))}
    </div>
  )
}
