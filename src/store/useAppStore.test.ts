import { describe, it, expect, beforeEach } from 'vitest'
import { act } from '@testing-library/react'
import { useAppStore } from './useAppStore'
import { Workspace, Terminal, BrowserPane } from '../types'

const ws1: Workspace = { id: 'ws-1', name: 'Work', emoji: '🔥', color: '#e8a045', position: 0, createdAt: 1000 }
const t1: Terminal = { id: 't-1', workspaceId: 'ws-1', shell: 'zsh', cwd: '/tmp', position: 0, sizePercent: 50, createdAt: 1001 }

beforeEach(() => {
  useAppStore.setState({
    workspaces: [],
    activeWorkspaceId: null,
    activeTerminalId: null,
    terminalsByWorkspace: {},
  })
})

describe('useAppStore', () => {
  it('sets workspaces', () => {
    act(() => useAppStore.getState().setWorkspaces([ws1]))
    expect(useAppStore.getState().workspaces).toEqual([ws1])
  })

  it('adds a workspace', () => {
    act(() => useAppStore.getState().addWorkspace(ws1))
    expect(useAppStore.getState().workspaces).toHaveLength(1)
  })

  it('removes a workspace', () => {
    act(() => {
      useAppStore.getState().setWorkspaces([ws1])
      useAppStore.getState().removeWorkspace('ws-1')
    })
    expect(useAppStore.getState().workspaces).toHaveLength(0)
  })

  it('sets active workspace', () => {
    act(() => useAppStore.getState().setActiveWorkspaceId('ws-1'))
    expect(useAppStore.getState().activeWorkspaceId).toBe('ws-1')
  })

  it('adds a terminal to a workspace', () => {
    act(() => useAppStore.getState().addTerminal('ws-1', t1))
    expect(useAppStore.getState().terminalsByWorkspace['ws-1']).toHaveLength(1)
  })

  it('removes a terminal from a workspace', () => {
    act(() => {
      useAppStore.getState().addTerminal('ws-1', t1)
      useAppStore.getState().removeTerminal('ws-1', 't-1')
    })
    expect(useAppStore.getState().terminalsByWorkspace['ws-1']).toHaveLength(0)
  })

  it('sets active terminal', () => {
    act(() => useAppStore.getState().setActiveTerminalId('t-1'))
    expect(useAppStore.getState().activeTerminalId).toBe('t-1')
  })
})

describe('browser pane store', () => {
  beforeEach(() => {
    useAppStore.setState({
      browserPanesByWorkspace: {},
      layoutsByWorkspace: {},
    })
  })

  it('addBrowserPane adds pane and creates browser layout node', () => {
    const pane: BrowserPane = {
      id: 'bp-1', workspaceId: 'ws-1', url: 'http://localhost:3000',
      position: 0, createdAt: 1000,
    }
    useAppStore.getState().addBrowserPane('ws-1', pane)
    const panes = useAppStore.getState().browserPanesByWorkspace['ws-1']
    expect(panes).toHaveLength(1)
    expect(panes[0].id).toBe('bp-1')

    const layout = useAppStore.getState().layoutsByWorkspace['ws-1']
    expect(layout?.type).toBe('browser')
  })

  it('removeBrowserPane removes pane from store and layout', () => {
    const pane: BrowserPane = {
      id: 'bp-1', workspaceId: 'ws-1', url: 'http://localhost:3000',
      position: 0, createdAt: 1000,
    }
    useAppStore.getState().addBrowserPane('ws-1', pane)
    useAppStore.getState().removeBrowserPane('ws-1', 'bp-1')
    const panes = useAppStore.getState().browserPanesByWorkspace['ws-1']
    expect(panes).toHaveLength(0)
    expect(useAppStore.getState().layoutsByWorkspace['ws-1']).toBeNull()
  })
})
