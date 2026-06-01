import { useState } from 'react'
import { motion } from 'framer-motion'
import { Terminal as TerminalType } from '../../types'
import { TerminalPane } from './TerminalPane'
import { Group, Panel, Separator } from 'react-resizable-panels'

interface Props {
  workspaceId: string
  terminals: TerminalType[]
  activeTerminalId: string | null
  onFocus: (terminalId: string) => void
  onClose: (terminalId: string) => void
}

const CustomResizeHandle = ({ id, direction }: { id: string, direction: 'horizontal' | 'vertical' }) => {
  return (
    <Separator
      id={id}
      style={{
        width: direction === 'horizontal' ? '6px' : '100%',
        height: direction === 'vertical' ? '6px' : '100%',
      }}
    >
      <div className="resize-icon">
        {direction === 'horizontal' ? (
          <svg width="8" height="24" viewBox="0 0 8 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="4" cy="6" r="1" />
            <circle cx="4" cy="12" r="1" />
            <circle cx="4" cy="18" r="1" />
          </svg>
        ) : (
          <svg width="24" height="8" viewBox="0 0 24 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="6" cy="4" r="1" />
            <circle cx="12" cy="4" r="1" />
            <circle cx="18" cy="4" r="1" />
          </svg>
        )}
      </div>
    </Separator>
  )
}

export function TerminalGrid({ workspaceId, terminals, activeTerminalId, onFocus, onClose }: Props) {
  const [maximizedTerminalId, setMaximizedTerminalId] = useState<string | null>(null)

  if (terminals.length === 0) return null

  const isMaximized = maximizedTerminalId !== null

  const renderTerminal = (t?: TerminalType) => {
    if (!t) return null
    return (
      <motion.div
        key={t.id}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2 }}
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
      </motion.div>
    )
  }

  const t0 = terminals[0]
  const t1 = terminals[1]
  const t2 = terminals[2]
  const t3 = terminals[3]

  // To prevent the React tree from rebuilding and unmounting TerminalPanes,
  // we render a static 2x2 layout using stable ids.
  return (
    <Group orientation="horizontal" id="main-group" style={{ flex: 1, padding: 6, gap: 4 }}>
      {(t0 || t2) && (
        <Panel id="left-col" defaultSize={t1 || t3 ? 50 : 100}>
          <Group orientation="vertical" id="left-col-group">
            {t0 && (
              <Panel id="slot-0" defaultSize={t2 ? 50 : 100}>
                {renderTerminal(t0)}
              </Panel>
            )}
            {t2 && <CustomResizeHandle id="vertical-1" direction="vertical" />}
            {t2 && (
              <Panel id="slot-2" defaultSize={50}>
                {renderTerminal(t2)}
              </Panel>
            )}
          </Group>
        </Panel>
      )}
      
      {(t1 || t3) && <CustomResizeHandle id="horizontal-main" direction="horizontal" />}
      
      {(t1 || t3) && (
        <Panel id="right-col" defaultSize={50}>
          <Group orientation="vertical" id="right-col-group">
            {t1 && (
              <Panel id="slot-1" defaultSize={t3 ? 50 : 100}>
                {renderTerminal(t1)}
              </Panel>
            )}
            {t3 && <CustomResizeHandle id="vertical-2" direction="vertical" />}
            {t3 && (
              <Panel id="slot-3" defaultSize={50}>
                {renderTerminal(t3)}
              </Panel>
            )}
          </Group>
        </Panel>
      )}
    </Group>
  )
}
