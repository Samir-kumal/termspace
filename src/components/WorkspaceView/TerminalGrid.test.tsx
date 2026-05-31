import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TerminalGrid } from './TerminalGrid'
import { Terminal } from '../../types'

vi.mock('./TerminalPane', () => ({
  TerminalPane: ({ terminalId }: { terminalId: string }) => (
    <div data-testid={`pane-${terminalId}`}>{terminalId}</div>
  ),
}))

// react-resizable-panels v4 uses ResizeObserver internally, which is not
// available in jsdom. Mock it with simple passthrough wrappers so layout
// tests focus on pane count rather than fighting the DOM environment.
vi.mock('react-resizable-panels', () => ({
  Group: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Panel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Separator: () => <div />,
}))

const makeTerminals = (n: number): Terminal[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `t-${i}`, workspaceId: 'ws-1', shell: 'zsh',
    cwd: '/tmp', position: i, sizePercent: 50, createdAt: 1000,
  }))

describe('TerminalGrid', () => {
  it('renders nothing when terminals array is empty', () => {
    const { container } = render(
      <TerminalGrid workspaceId="ws-1" terminals={[]} activeTerminalId={null} onFocus={vi.fn()} onClose={vi.fn()} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders 1 terminal', () => {
    render(<TerminalGrid workspaceId="ws-1" terminals={makeTerminals(1)} activeTerminalId="t-0" onFocus={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByTestId('pane-t-0')).toBeInTheDocument()
  })

  it('renders 2 terminals', () => {
    render(<TerminalGrid workspaceId="ws-1" terminals={makeTerminals(2)} activeTerminalId="t-0" onFocus={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getAllByTestId(/^pane-/)).toHaveLength(2)
  })

  it('renders 3 terminals', () => {
    render(<TerminalGrid workspaceId="ws-1" terminals={makeTerminals(3)} activeTerminalId="t-0" onFocus={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getAllByTestId(/^pane-/)).toHaveLength(3)
  })

  it('renders 4 terminals', () => {
    render(<TerminalGrid workspaceId="ws-1" terminals={makeTerminals(4)} activeTerminalId="t-0" onFocus={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getAllByTestId(/^pane-/)).toHaveLength(4)
  })
})
