import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { Terminal as TerminalType, LayoutNode } from '../../types'
import { TerminalPane } from './TerminalPane'
import { BrowserPane } from './BrowserPane'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { useAppStore } from '../../store/useAppStore'

interface Props {
  workspaceId: string
  terminals: TerminalType[]
  activeTerminalId: string | null
  onFocus: (terminalId: string) => void
  onClose: (terminalId: string) => void
  onSplit: (terminalId: string, direction: 'horizontal' | 'vertical') => void
  onCloseBrowserPane: (browserPaneId: string) => void
  onSplitBrowserPane: (browserPaneId: string, direction: 'horizontal' | 'vertical') => void
}

const CustomResizeHandle = ({ id, direction }: { id: string, direction: 'horizontal' | 'vertical' }) => {
  return (
    <Separator
      id={id}
      style={{
        width: direction === 'horizontal' ? '6px' : '100%',
        height: direction === 'vertical' ? '6px' : '100%',
        cursor: direction === 'horizontal' ? 'col-resize' : 'row-resize',
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

export function TerminalGrid({ workspaceId, terminals, activeTerminalId, onFocus, onClose, onSplit, onCloseBrowserPane, onSplitBrowserPane }: Props) {
  const [maximizedTerminalId, setMaximizedTerminalId] = useState<string | null>(null)
  const [dragOverTerminalId, setDragOverTerminalId] = useState<string | null>(null)
  const reorderTerminals = useAppStore((s) => s.reorderTerminals)
  const updateLayoutSizes = useAppStore((s) => s.updateLayoutSizes)
  const layout = useAppStore((s) => s.layoutsByWorkspace[workspaceId])

  if (terminals.length === 0 || !layout) return null

  const isMaximized = maximizedTerminalId !== null

  const renderTerminal = (terminalId: string) => {
    const t = terminals.find(t => t.id === terminalId)
    if (!t) return null
    return (
      <motion.div
        key={t.id}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2 }}
        onDragOver={(e) => {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
          if (dragOverTerminalId !== t.id) setDragOverTerminalId(t.id)
        }}
        onDragLeave={() => {
          if (dragOverTerminalId === t.id) setDragOverTerminalId(null)
        }}
        onDrop={(e) => {
          e.preventDefault()
          setDragOverTerminalId(null)
          const sourceId = e.dataTransfer.getData('application/terminal-id')
          if (sourceId && sourceId !== t.id) {
            reorderTerminals(workspaceId, sourceId, t.id)
          }
        }}
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
          isDragOver={dragOverTerminalId === t.id}
          scrollback={t.scrollback}
          isMaximized={maximizedTerminalId === t.id}
          onFocus={() => onFocus(t.id)}
          onSplit={(direction) => onSplit(t.id, direction)}
          onToggleMaximize={() => setMaximizedTerminalId(maximizedTerminalId === t.id ? null : t.id)}
          onClose={() => {
            if (maximizedTerminalId === t.id) setMaximizedTerminalId(null)
            onClose(t.id)
          }}
        />
      </motion.div>
    )
  }

  const browserPanes = useAppStore((s) => s.browserPanesByWorkspace[workspaceId] ?? [])

  const renderBrowserPane = (browserPaneId: string) => {
    const pane = browserPanes.find(p => p.id === browserPaneId)
    if (!pane) return null
    return (
      <div
        key={pane.id}
        style={{ display: 'flex', width: '100%', height: '100%', minWidth: 0, minHeight: 0 }}
      >
        <BrowserPane
          browserPaneId={pane.id}
          initialUrl={pane.url}
          isActive={pane.id === activeTerminalId}
          isMaximized={maximizedTerminalId === pane.id}
          onFocus={() => onFocus(pane.id)}
          onClose={() => {
            if (maximizedTerminalId === pane.id) setMaximizedTerminalId(null)
            onCloseBrowserPane(pane.id)
          }}
          onSplit={(direction) => onSplitBrowserPane(pane.id, direction)}
          onToggleMaximize={() => setMaximizedTerminalId(maximizedTerminalId === pane.id ? null : pane.id)}
        />
      </div>
    )
  }

  const renderLayoutNode = (node: LayoutNode): React.ReactNode => {
    if (node.type === 'pane') {
      return renderTerminal(node.terminalId)
    }

    if (node.type === 'browser') {
      return renderBrowserPane(node.browserPaneId)
    }

    if (node.type === 'split') {
      return (
        <Group 
          orientation={node.direction} 
          id={node.id}
          autoSave={node.id}
          // @ts-ignore: onLayout takes number[]
          onLayout={(sizes: number[]) => {
            updateLayoutSizes(workspaceId, node.id, sizes)
          }}
          style={{ width: '100%', height: '100%' }}
        >
          {node.children.map((child, idx) => (
            <React.Fragment key={child.id}>
              {idx > 0 && <CustomResizeHandle id={`handle-${node.id}-${idx}`} direction={node.direction} />}
              <Panel id={child.id} defaultSize={node.sizes[idx] ?? (100 / node.children.length)}>
                {renderLayoutNode(child)}
              </Panel>
            </React.Fragment>
          ))}
        </Group>
      )
    }

    return null
  }

  return (
    <div style={{ flex: 1, padding: 12, minHeight: 0, minWidth: 0, overflow: 'hidden' }}>
      {renderLayoutNode(layout)}
    </div>
  )
}
