export interface Workspace {
  id: string
  name: string
  emoji: string
  color: string
  position: number
  createdAt: number
  notificationCount?: number
}

export interface Terminal {
  id: string
  workspaceId: string
  title?: string
  shell: string
  cwd: string
  position: number
  sizePercent: number
  createdAt: number
  scrollback?: string[]
}

export interface BrowserPane {
  id: string
  workspaceId: string
  url: string
  position: number
  createdAt: number
}

export type LayoutDirection = 'horizontal' | 'vertical'

export type LayoutNode =
  | { type: 'pane';    id: string; terminalId: string }
  | { type: 'browser'; id: string; browserPaneId: string }
  | { type: 'split';   id: string; direction: LayoutDirection; sizes: number[]; children: LayoutNode[] }

