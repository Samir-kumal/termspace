import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useAppStore } from './store/useAppStore'
import { WorkspaceSidebar } from './components/WorkspaceSidebar/WorkspaceSidebar'
import { WorkspaceView } from './components/WorkspaceView/WorkspaceView'
import { WorkspaceModal } from './components/WorkspaceModal/WorkspaceModal'
import { SettingsModal } from './components/SettingsModal/SettingsModal'
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
  const removeWorkspace = useAppStore((s) => s.removeWorkspace)
  const setActiveTerminalId = useAppStore((s) => s.setActiveTerminalId)

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [editingWorkspace, setEditingWorkspace] = useState<Workspace | null>(null)
  const [loading, setLoading] = useState(true)
  const [bootstrapError, setBootstrapError] = useState<string | null>(null)
  const settings = useAppStore((s) => s.settings)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme)
  }, [settings.theme])

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
    // Spawn terminals serially — SSH connections compete for MaxStartups if
    // all fire simultaneously, exhausting the system process limit.
    const spawned: Terminal[] = []
    for (const t of saved) {
      const [scrollback] = await Promise.all([
        invoke<string[]>('load_scrollback', { terminalId: t.id }),
        invoke<void>('respawn_terminal', { id: t.id, shell: t.shell, cwd: t.cwd || '' }),
      ])
      spawned.push({ ...t, scrollback })
    }
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
    bootstrap()
      .catch((err) => setBootstrapError(String(err)))
      .finally(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSelectWorkspace(id: string) {
    setActiveWorkspaceId(id)
    setActiveTerminalId(null)
    
    // Only activate if we haven't loaded/spawned terminals for this workspace yet
    const currentTerminals = useAppStore.getState().terminalsByWorkspace[id]
    if (!currentTerminals) {
      await activateWorkspace(id)
    }
  }

  async function handleCreateWorkspace(values: { name: string; emoji: string; color: string }) {
    const ws = await invoke<Workspace>('create_workspace', values)
    addWorkspace(ws)
    setActiveWorkspaceId(ws.id)
    await spawnAndAddTerminal(ws.id)
    setShowCreateModal(false)
  }

  async function handleDeleteWorkspace(id: string) {
    // Don't delete the last workspace
    if (workspaces.length <= 1) return
    await invoke('delete_workspace', { id })
    removeWorkspace(id)
    // activateWorkspace is triggered via the store's removeWorkspace selector
    // which picks the next available workspace; activate it here
    const next = useAppStore.getState().activeWorkspaceId
    if (next) {
      const currentTerminals = useAppStore.getState().terminalsByWorkspace[next]
      if (!currentTerminals) {
        await activateWorkspace(next)
      }
    }
  }

  async function handleEditWorkspace(values: { name: string; emoji: string; color: string }) {
    if (!editingWorkspace) return
    await invoke('update_workspace', { id: editingWorkspace.id, ...values })
    updateWorkspace({ ...editingWorkspace, ...values })
    setEditingWorkspace(null)
  }

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      <WorkspaceSidebar
        onAddWorkspace={() => setShowCreateModal(true)}
        onSelectWorkspace={handleSelectWorkspace}
        onDeleteWorkspace={handleDeleteWorkspace}
        onOpenSettings={() => setShowSettingsModal(true)}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Always show bootstrap/spawn errors prominently at the top */}
        {bootstrapError && (
          <div style={{
            padding: '8px 14px', background: 'rgba(224,123,123,0.15)',
            borderBottom: '1px solid rgba(224,123,123,0.4)',
            color: '#e07b7b', fontSize: 12, flexShrink: 0,
          }}>
            ⚠ {bootstrapError}
          </div>
        )}
        
        {loading ? (
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center',
            justifyContent: 'center', flexDirection: 'column', gap: 8,
          }}>
            <span style={{ color: 'var(--text-inactive)', fontSize: 13 }}>Starting…</span>
          </div>
        ) : workspaces.length > 0 ? (
          workspaces.map((ws) => (
            <div
              key={ws.id}
              style={{
                display: ws.id === activeWorkspaceId ? 'flex' : 'none',
                flex: 1, flexDirection: 'column', height: '100%', overflow: 'hidden'
              }}
            >
              <WorkspaceView
                workspace={ws}
                onEditWorkspace={setEditingWorkspace}
              />
            </div>
          ))
        ) : (
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center',
            justifyContent: 'center', flexDirection: 'column', gap: 8,
          }}>
            <span style={{ color: 'var(--text-inactive)', fontSize: 13 }}>No workspace selected</span>
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
      {showSettingsModal && (
        <SettingsModal onClose={() => setShowSettingsModal(false)} />
      )}
    </div>
  )
}

