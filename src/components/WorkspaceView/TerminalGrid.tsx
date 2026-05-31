import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels'
import { Terminal as TerminalType } from '../../types'
import { TerminalPane } from './TerminalPane'

interface Props {
  workspaceId: string
  terminals: TerminalType[]
  activeTerminalId: string | null
  onFocus: (terminalId: string) => void
}

const HANDLE_STYLE_H = { width: 'var(--handle-size)' as const }
const HANDLE_STYLE_V = { height: 'var(--handle-size)' as const }

export function TerminalGrid({ workspaceId, terminals, activeTerminalId, onFocus }: Props) {
  if (terminals.length === 0) return null

  // Wrapper ensures TerminalPane fills the Panel's allocated space
  const pane = (t: TerminalType) => (
    <div key={t.id} style={{ width: '100%', height: '100%' }}>
      <TerminalPane
        terminalId={t.id}
        workspaceId={workspaceId}
        isActive={t.id === activeTerminalId}
        scrollback={t.scrollback}
        onFocus={() => onFocus(t.id)}
      />
    </div>
  )

  if (terminals.length === 1) {
    return (
      <div style={{ flex: 1, display: 'flex', padding: 6, overflow: 'hidden' }}>
        {pane(terminals[0])}
      </div>
    )
  }

  if (terminals.length === 2) {
    return (
      <PanelGroup id={`${workspaceId}-h`} orientation="horizontal" style={{ flex: 1, padding: 6 }}>
        <Panel defaultSize={50}>{pane(terminals[0])}</Panel>
        <PanelResizeHandle style={HANDLE_STYLE_H} />
        <Panel defaultSize={50}>{pane(terminals[1])}</Panel>
      </PanelGroup>
    )
  }

  if (terminals.length === 3) {
    return (
      <PanelGroup id={`${workspaceId}-h`} orientation="horizontal" style={{ flex: 1, padding: 6 }}>
        <Panel defaultSize={50}>{pane(terminals[0])}</Panel>
        <PanelResizeHandle style={HANDLE_STYLE_H} />
        <Panel defaultSize={50}>
          <PanelGroup id={`${workspaceId}-v`} orientation="vertical">
            <Panel defaultSize={50}>{pane(terminals[1])}</Panel>
            <PanelResizeHandle style={HANDLE_STYLE_V} />
            <Panel defaultSize={50}>{pane(terminals[2])}</Panel>
          </PanelGroup>
        </Panel>
      </PanelGroup>
    )
  }

  // 4 terminals: 2×2 grid
  return (
    <PanelGroup id={`${workspaceId}-v`} orientation="vertical" style={{ flex: 1, padding: 6 }}>
      <Panel defaultSize={50}>
        <PanelGroup id={`${workspaceId}-h-top`} orientation="horizontal">
          <Panel defaultSize={50}>{pane(terminals[0])}</Panel>
          <PanelResizeHandle style={HANDLE_STYLE_H} />
          <Panel defaultSize={50}>{pane(terminals[1])}</Panel>
        </PanelGroup>
      </Panel>
      <PanelResizeHandle style={HANDLE_STYLE_V} />
      <Panel defaultSize={50}>
        <PanelGroup id={`${workspaceId}-h-bot`} orientation="horizontal">
          <Panel defaultSize={50}>{pane(terminals[2])}</Panel>
          <PanelResizeHandle style={HANDLE_STYLE_H} />
          <Panel defaultSize={50}>{pane(terminals[3])}</Panel>
        </PanelGroup>
      </Panel>
    </PanelGroup>
  )
}
