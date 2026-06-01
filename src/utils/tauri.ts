import { invoke as tauriInvoke, isTauri as checkIsTauri } from '@tauri-apps/api/core'
import { listen as tauriListen } from '@tauri-apps/api/event'

// Fallback error boundaries / mock invoke for web development to simulate a terminal environment when not in Tauri
const isTauri = checkIsTauri();

let mockTerminalCounter = 1;

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri) {
    return tauriInvoke<T>(cmd, args);
  }

  console.warn(`[Mock Tauri] invoke('${cmd}') with args:`, args);

  switch (cmd) {
    case 'get_workspaces':
      return [] as unknown as T;
    case 'create_workspace':
      return {
        id: `mock-ws-${Date.now()}`,
        name: args?.name || 'Mock Workspace',
        emoji: args?.emoji || '💻',
        color: args?.color || '#e8a045'
      } as unknown as T;
    case 'update_workspace':
    case 'delete_workspace':
    case 'respawn_terminal':
      return undefined as unknown as T;
    case 'spawn_terminal':
      return {
        id: `mock-term-${mockTerminalCounter++}`,
        shell: args?.shell || 'zsh',
        cwd: args?.cwd || ''
      } as unknown as T;
    case 'get_terminals':
      return [] as unknown as T;
    case 'load_scrollback':
      return [] as unknown as T;
    case 'pty_write':
    case 'pty_resize':
    case 'kill_terminal':
      return undefined as unknown as T;
    default:
      console.warn(`[Mock Tauri] Unhandled command: ${cmd}`);
      return undefined as unknown as T;
  }
}

export function listen<T>(event: string, handler: (event: any) => void): Promise<() => void> {
  if (isTauri) {
    return tauriListen<T>(event, handler);
  }
  console.warn(`[Mock Tauri] listen('${event}')`);
  
  // Return a dummy unlisten function
  return Promise.resolve(() => {});
}
