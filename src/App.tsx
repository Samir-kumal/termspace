import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useAppStore } from './store/useAppStore'
import { WorkspaceSidebar } from './components/WorkspaceSidebar/WorkspaceSidebar'
import { WorkspaceView } from './components/WorkspaceView/WorkspaceView'
import { WorkspaceModal } from './components/WorkspaceModal/WorkspaceModal'
import { Workspace, Terminal } from './types'

export default function App() {
  const workspaces = useAppStore((s) => s.workspaces)
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId)
  const setWorkspaces = useAppStore((s) => s.setWorkspaces)
  const addWorkspace = useAppStore((s) => s.addWorkspace)
  const updateWorkspace = useAppStore((s) => s.updateWorkspace)
  const setActiveWorkspaceId = useAppStore((s) => s.setActiveWorkspaceId)
  const setTerminals = useAppStore((s) => s.setTerminals)
  const addTerminal = useAppStore((s) => s.addTerminal)
  const setActiveTerminalId = useAppStore((s) => s.setActiveTerminalId)

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingWorkspace, setEditingWorkspace] = useState<Workspace | null>(null)

  async function spawnAndAddTerminal(workspaceId: string) {
    const terminal = await invoke<Terminal>('spawn_terminal', {
      workspaceId, shell: 'zsh', cwd: '',
    })
    addTerminal(workspaceId, terminal)
    setActiveTerminalId(terminal.id)
  }

  async function activateWorkspace(workspaceId: string) {
    const saved = await invoke<Terminal[]>('get_terminals', { workspaceId })
    if (saved.length === 0) {
      await spawnAndAddTerminal(workspaceId)
      return
    }
    // spawn all terminals in parallel — no serial round-trips
    const spawned = await Promise.all(
      saved.map(async (t) => {
        const [scrollback, fresh] = await Promise.all([
          invoke<string[]>('load_scrollback', { terminalId: t.id }),
          invoke<Terminal>('spawn_terminal', { workspaceId, shell: t.shell, cwd: t.cwd || '' }),
        ])
        return { ...fresh, scrollback }
      })
    )
    setTerminals(workspaceId, spawned)
    setActiveTerminalId(spawned[0]?.id ?? null)
  }

  useEffect(() => {
    async function bootstrap() {
      const wsList = await invoke<Workspace[]>('get_workspaces')
      if (wsList.length === 0) {
        const ws = await invoke<Workspace>('create_workspace', {
          name: 'Main', emoji: '💻', color: '#e8a045',
        })
        setWorkspaces([ws])
        setActiveWorkspaceId(ws.id)
        await spawnAndAddTerminal(ws.id)
      } else {
        setWorkspaces(wsList)
        setActiveWorkspaceId(wsList[0].id)
        await activateWorkspace(wsList[0].id)
      }
    }
    bootstrap().catch(console.error)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSelectWorkspace(id: string) {
    setActiveWorkspaceId(id)
    setActiveTerminalId(null)
    await activateWorkspace(id)
  }

  async function handleCreateWorkspace(values: { name: string; emoji: string; color: string }) {
    const ws = await invoke<Workspace>('create_workspace', values)
    addWorkspace(ws)
    setActiveWorkspaceId(ws.id)
    await spawnAndAddTerminal(ws.id)
    setShowCreateModal(false)
  }

  async function handleEditWorkspace(values: { name: string; emoji: string; color: string }) {
    if (!editingWorkspace) return
    await invoke('update_workspace', { id: editingWorkspace.id, ...values })
    updateWorkspace({ ...editingWorkspace, ...values })
    setEditingWorkspace(null)
  }

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId)

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      <WorkspaceSidebar
        onAddWorkspace={() => setShowCreateModal(true)}
        onSelectWorkspace={handleSelectWorkspace}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {activeWorkspace ? (
          <WorkspaceView
            workspace={activeWorkspace}
            onEditWorkspace={setEditingWorkspace}
          />
        ) : (
          <div
            style={{
              flex: 1, display: 'flex', alignItems: 'center',
              justifyContent: 'center', color: 'var(--text-dim)', fontSize: 13,
            }}
          >
            No workspace selected
          </div>
        )}
      </div>

      {showCreateModal && (
        <WorkspaceModal onSave={handleCreateWorkspace} onCancel={() => setShowCreateModal(false)} />
      )}
      {editingWorkspace && (
        <WorkspaceModal
          initial={editingWorkspace}
          onSave={handleEditWorkspace}
          onCancel={() => setEditingWorkspace(null)}
        />
      )}
    </div>
  )
}
