import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Workspace, Terminal, BrowserPane, LayoutNode, LayoutDirection } from '../types'
import { addTerminalToLayout, removeTerminalFromLayout, swapTerminalsInLayout, updateSplitSizes, addBrowserPaneToLayout, removeBrowserPaneFromLayout } from '../utils/layout'

export interface Keybindings {
  newTerminal: string
  closeTerminal: string
  nextTerminal: string
  prevTerminal: string
  commandPalette: string
}

export interface Settings {
  theme: 'warm-dark' | 'cold-dark' | 'light'
  fontSize: number
  keybindings: Keybindings
}

interface AppState {
  workspaces: Workspace[]
  activeWorkspaceId: string | null
  activeTerminalId: string | null
  terminalsByWorkspace: Record<string, Terminal[]>
  browserPanesByWorkspace: Record<string, BrowserPane[]>
  layoutsByWorkspace: Record<string, LayoutNode | null>
  settings: Settings
  contextMenu: {
    x: number
    y: number
    items: { label: string; icon?: React.ReactNode; onClick: () => void; danger?: boolean; separator?: boolean }[]
  } | null
  
  setWorkspaces: (workspaces: Workspace[]) => void
  addWorkspace: (workspace: Workspace) => void
  updateWorkspace: (workspace: Workspace) => void
  removeWorkspace: (id: string) => void
  setActiveWorkspaceId: (id: string | null) => void
  setTerminals: (workspaceId: string, terminals: Terminal[]) => void
  addTerminal: (workspaceId: string, terminal: Terminal, targetId?: string, direction?: LayoutDirection) => void
  removeTerminal: (workspaceId: string, terminalId: string) => void
  setBrowserPanes: (workspaceId: string, panes: BrowserPane[]) => void
  addBrowserPane: (workspaceId: string, pane: BrowserPane, targetId?: string, direction?: LayoutDirection) => void
  removeBrowserPane: (workspaceId: string, browserPaneId: string) => void
  reorderTerminals: (workspaceId: string, sourceTerminalId: string, targetTerminalId: string) => void
  updateLayoutSizes: (workspaceId: string, splitId: string, sizes: number[]) => void
  setActiveTerminalId: (id: string | null) => void
  updateSettings: (settings: Partial<Settings>) => void
  showContextMenu: (x: number, y: number, items: NonNullable<AppState['contextMenu']>['items']) => void
  hideContextMenu: () => void
  
  toasts: { id: string; message: string; type: 'success' | 'error' | 'info' }[]
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void
  removeToast: (id: string) => void

  showCommandPalette: boolean
  setShowCommandPalette: (show: boolean) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      workspaces: [],
      activeWorkspaceId: null,
      activeTerminalId: null,
      terminalsByWorkspace: {},
      browserPanesByWorkspace: {},
      layoutsByWorkspace: {},
      contextMenu: null,
      toasts: [],
      showCommandPalette: false,
      settings: {
        theme: 'warm-dark',
        fontSize: 13,
        keybindings: {
          newTerminal: 'CmdOrCtrl+T',
          closeTerminal: 'CmdOrCtrl+W',
          nextTerminal: 'CmdOrCtrl+Shift+]',
          prevTerminal: 'CmdOrCtrl+Shift+[',
          commandPalette: 'CmdOrCtrl+K',
        }
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
        set((s) => {
          let layout = s.layoutsByWorkspace[workspaceId] ?? null
          
          if (terminals.length === 0) {
            layout = null // wipe stale layout from localStorage
          } else if (!layout) {
            // Build a flat layout for legacy restored terminals
            terminals.forEach(t => {
              layout = addTerminalToLayout(layout, t.id)
            })
          } else {
            // Clean up any stale terminals from the layout that no longer exist in DB
            const validIds = new Set(terminals.map(t => t.id))
            const cleanLayout = (node: LayoutNode | null): LayoutNode | null => {
              if (!node) return null
              if (node.type === 'pane') {
                return validIds.has(node.terminalId) ? node : null
              }
              if (node.type === 'browser') {
                // browser pane IDs are validated separately when browser panes load
                return node
              }
              if (node.type === 'split') {
                const newChildren = node.children.map(cleanLayout).filter(Boolean) as LayoutNode[]
                if (newChildren.length === 0) return null
                if (newChildren.length === 1) return newChildren[0]
                return { ...node, children: newChildren }
              }
              return node
            }
            layout = cleanLayout(layout)
          }

          return {
            terminalsByWorkspace: { ...s.terminalsByWorkspace, [workspaceId]: terminals },
            layoutsByWorkspace: { ...s.layoutsByWorkspace, [workspaceId]: layout },
          }
        }),

      addTerminal: (workspaceId, terminal, targetId, direction) =>
        set((s) => {
          const layout = s.layoutsByWorkspace[workspaceId] ?? null
          return {
            terminalsByWorkspace: {
              ...s.terminalsByWorkspace,
              [workspaceId]: [...(s.terminalsByWorkspace[workspaceId] ?? []), terminal],
            },
            layoutsByWorkspace: {
              ...s.layoutsByWorkspace,
              [workspaceId]: addTerminalToLayout(layout, terminal.id, targetId, direction),
            }
          }
        }),

      removeTerminal: (workspaceId, terminalId) =>
        set((s) => {
          const layout = s.layoutsByWorkspace[workspaceId] ?? null
          return {
            terminalsByWorkspace: {
              ...s.terminalsByWorkspace,
              [workspaceId]: (s.terminalsByWorkspace[workspaceId] ?? []).filter(
                (t) => t.id !== terminalId,
              ),
            },
            layoutsByWorkspace: {
              ...s.layoutsByWorkspace,
              [workspaceId]: removeTerminalFromLayout(layout, terminalId),
            }
          }
        }),

      setBrowserPanes: (workspaceId, panes) =>
        set((s) => {
          let layout = s.layoutsByWorkspace[workspaceId] ?? null
          if (panes.length > 0) {
            const existingBrowserIds = new Set<string>()
            const collectBrowserIds = (node: LayoutNode | null) => {
              if (!node) return
              if (node.type === 'browser') existingBrowserIds.add(node.browserPaneId)
              if (node.type === 'split') node.children.forEach(collectBrowserIds)
            }
            collectBrowserIds(layout)
            for (const pane of panes) {
              if (!existingBrowserIds.has(pane.id)) {
                layout = addBrowserPaneToLayout(layout, pane.id)
              }
            }
          }
          return {
            browserPanesByWorkspace: { ...s.browserPanesByWorkspace, [workspaceId]: panes },
            layoutsByWorkspace: { ...s.layoutsByWorkspace, [workspaceId]: layout },
          }
        }),

      addBrowserPane: (workspaceId, pane, targetId, direction) =>
        set((s) => {
          const layout = s.layoutsByWorkspace[workspaceId] ?? null
          return {
            browserPanesByWorkspace: {
              ...s.browserPanesByWorkspace,
              [workspaceId]: [...(s.browserPanesByWorkspace[workspaceId] ?? []), pane],
            },
            layoutsByWorkspace: {
              ...s.layoutsByWorkspace,
              [workspaceId]: addBrowserPaneToLayout(layout, pane.id, targetId, direction),
            },
          }
        }),

      removeBrowserPane: (workspaceId, browserPaneId) =>
        set((s) => {
          const layout = s.layoutsByWorkspace[workspaceId] ?? null
          return {
            browserPanesByWorkspace: {
              ...s.browserPanesByWorkspace,
              [workspaceId]: (s.browserPanesByWorkspace[workspaceId] ?? []).filter(
                (p) => p.id !== browserPaneId,
              ),
            },
            layoutsByWorkspace: {
              ...s.layoutsByWorkspace,
              [workspaceId]: removeBrowserPaneFromLayout(layout, browserPaneId),
            },
          }
        }),

      reorderTerminals: (workspaceId, sourceTerminalId, targetTerminalId) =>
        set((s) => {
          const currentTerminals = s.terminalsByWorkspace[workspaceId] ?? []
          const sourceIndex = currentTerminals.findIndex((t) => t.id === sourceTerminalId)
          const targetIndex = currentTerminals.findIndex((t) => t.id === targetTerminalId)
          if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) return s

          const layout = s.layoutsByWorkspace[workspaceId] ?? null
          
          return {
            layoutsByWorkspace: {
              ...s.layoutsByWorkspace,
              [workspaceId]: swapTerminalsInLayout(layout, sourceTerminalId, targetTerminalId),
            },
          }
        }),

      updateLayoutSizes: (workspaceId, splitId, sizes) => 
        set((s) => {
          const layout = s.layoutsByWorkspace[workspaceId] ?? null
          return {
            layoutsByWorkspace: {
              ...s.layoutsByWorkspace,
              [workspaceId]: updateSplitSizes(layout, splitId, sizes),
            }
          }
        }),

      setActiveTerminalId: (id) => set({ activeTerminalId: id }),

      updateSettings: (settings) =>
        set((s) => ({ settings: { ...s.settings, ...settings } })),
        
      showContextMenu: (x, y, items) => set({ contextMenu: { x, y, items } }),
      hideContextMenu: () => set({ contextMenu: null }),

      addToast: (message, type = 'info') => {
        const id = Math.random().toString(36).substring(2, 9)
        set((s) => ({ toasts: [...s.toasts, { id, message, type }] }))
        setTimeout(() => {
          useAppStore.getState().removeToast(id)
        }, 3000)
      },
      removeToast: (id) => set((s) => ({ toasts: s.toasts.filter(t => t.id !== id) })),
      setShowCommandPalette: (show) => set({ showCommandPalette: show }),
    }),
    {
      name: 'termspace-storage',
      partialize: (state) => ({ 
        settings: state.settings,
        layoutsByWorkspace: state.layoutsByWorkspace
      }),
    }
  )
)
