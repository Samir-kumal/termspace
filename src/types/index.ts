export interface Workspace {
  id: string
  name: string
  emoji: string
  color: string
  position: number
  createdAt: number
}

export interface Terminal {
  id: string
  workspaceId: string
  shell: string
  cwd: string
  position: number
  sizePercent: number
  createdAt: number
  scrollback?: string[]  // transient: populated on restore, not saved in DB
}

export type LayoutDirection = 'horizontal' | 'vertical'

export type LayoutNode =
  | { type: 'pane'; id: string; terminalId: string }
  | { type: 'split'; id: string; direction: LayoutDirection; sizes: number[]; children: LayoutNode[] }

