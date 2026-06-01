import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Workspace, Terminal } from '../types'

export interface Settings {
  theme: 'warm-dark' | 'cold-dark' | 'light'
  fontSize: number
}

interface AppState {
  workspaces: Workspace[]
  activeWorkspaceId: string | null
  activeTerminalId: string | null
  terminalsByWorkspace: Record<string, Terminal[]>
  settings: Settings
  
  setWorkspaces: (workspaces: Workspace[]) => void
  addWorkspace: (workspace: Workspace) => void
  updateWorkspace: (workspace: Workspace) => void
  removeWorkspace: (id: string) => void
  setActiveWorkspaceId: (id: string | null) => void
  setTerminals: (workspaceId: string, terminals: Terminal[]) => void
  addTerminal: (workspaceId: string, terminal: Terminal) => void
  removeTerminal: (workspaceId: string, terminalId: string) => void
  reorderTerminals: (workspaceId: string, sourceTerminalId: string, targetTerminalId: string) => void
  setActiveTerminalId: (id: string | null) => void
  updateSettings: (settings: Partial<Settings>) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      workspaces: [],
      activeWorkspaceId: null,
      activeTerminalId: null,
      terminalsByWorkspace: {},
      settings: {
        theme: 'warm-dark',
        fontSize: 13,
      },

      setWorkspaces: (workspaces) => set({ workspaces }),

      addWorkspace: (workspace) =>
        set((s) => ({ workspaces: [...s.workspaces, workspace] })),

      updateWorkspace: (workspace) =>
        set((s) => ({
          workspaces: s.workspaces.map((w) => (w.id === workspace.id ? workspace : w)),
        })),

      removeWorkspace: (id) =>
        set((s) => ({
          workspaces: s.workspaces.filter((w) => w.id !== id),
          activeWorkspaceId:
            s.activeWorkspaceId === id
              ? (s.workspaces.find((w) => w.id !== id)?.id ?? null)
              : s.activeWorkspaceId,
        })),

      setActiveWorkspaceId: (id) => set({ activeWorkspaceId: id }),

      setTerminals: (workspaceId, terminals) =>
        set((s) => ({
          terminalsByWorkspace: { ...s.terminalsByWorkspace, [workspaceId]: terminals },
        })),

      addTerminal: (workspaceId, terminal) =>
        set((s) => ({
          terminalsByWorkspace: {
            ...s.terminalsByWorkspace,
            [workspaceId]: [...(s.terminalsByWorkspace[workspaceId] ?? []), terminal],
          },
        })),

      removeTerminal: (workspaceId, terminalId) =>
        set((s) => ({
          terminalsByWorkspace: {
            ...s.terminalsByWorkspace,
            [workspaceId]: (s.terminalsByWorkspace[workspaceId] ?? []).filter(
              (t) => t.id !== terminalId,
            ),
          },
        })),

      reorderTerminals: (workspaceId, sourceTerminalId, targetTerminalId) =>
        set((s) => {
          const currentTerminals = s.terminalsByWorkspace[workspaceId] ?? []
          const sourceIndex = currentTerminals.findIndex((t) => t.id === sourceTerminalId)
          const targetIndex = currentTerminals.findIndex((t) => t.id === targetTerminalId)
          if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) return s

          const newTerminals = [...currentTerminals]
          const [removed] = newTerminals.splice(sourceIndex, 1)
          newTerminals.splice(targetIndex, 0, removed)

          return {
            terminalsByWorkspace: {
              ...s.terminalsByWorkspace,
              [workspaceId]: newTerminals,
            },
          }
        }),

      setActiveTerminalId: (id) => set({ activeTerminalId: id }),

      updateSettings: (settings) =>
        set((s) => ({ settings: { ...s.settings, ...settings } })),
    }),
    {
      name: 'termspace-storage',
      // Only persist settings
      partialize: (state) => ({ settings: state.settings }),
    }
  )
)
