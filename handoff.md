# Termspace — Project Handoff

## What This Is

A native macOS terminal workspace app built with Tauri v2 (Rust backend + React/TypeScript frontend via WKWebView). Features a vertical workspace sidebar with up to 4 resizable terminals per workspace, click-to-focus, and full persistence across restarts.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Native shell | Tauri v2 (Rust + WKWebView) |
| Frontend | React 18 + TypeScript + Vite |
| Terminal rendering | xterm.js + FitAddon + SerializeAddon |
| Terminal layout | CSS grid (was react-resizable-panels v4 — removed to fix remounting bug) |
| State management | Zustand |
| Database | SQLite via rusqlite (bundled) |
| PTY | `portable-pty` crate (native posix_openpt) |

---

## Project Structure

```
termspace/
├── src/                          # React frontend
│   ├── App.tsx                   # Bootstrap, workspace lifecycle
│   ├── store/useAppStore.ts      # Zustand store
│   ├── types/index.ts            # Workspace, Terminal types
│   ├── styles/globals.css        # CSS vars (Dark Warm theme)
│   ├── main.tsx                  # Entry — StrictMode intentionally removed
│   └── components/
│       ├── WorkspaceSidebar/     # Left sidebar (WorkspaceSidebar, AddWorkspaceButton)
│       ├── WorkspaceView/        # Main area (WorkspaceView, TerminalGrid, TerminalPane)
│       └── WorkspaceModal/       # Create/edit workspace dialog
│
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs                # Tauri entry, registers all commands
│   │   ├── commands.rs           # Tauri command handlers (DB + PTY bridge)
│   │   ├── pty_manager.rs        # Native PTY manager (portable-pty)
│   │   └── db.rs                 # SQLite schema + CRUD
│   ├── Cargo.toml
│   └── tauri.conf.json
│
└── handoff.md                    # This file
```

---

## Architecture

### Data Flow

```
xterm.js keystroke
  → invoke('write_pty')
    → PtyManager::write() → PTY master
      → shell

shell output
  → PTY master
    → background read thread → app.emit('pty-output-<id>')
      → TerminalPane listen() → xterm.write()
```

### PTY Two-Phase Design

To avoid a race where the shell emits its initial prompt before the frontend listener is attached:

1. **`spawn_terminal`** — opens native PTY via `portable-pty`, stores reader in `PtyHandle.reader: Option<Box<dyn Read+Send>>`, does NOT start reading yet
2. **`start_terminal`** — called by frontend AFTER `listen()` is registered, takes the reader and starts the background emit thread

### Persistence

- All workspaces stored in SQLite (`workspaces` table)
- All terminal metadata stored (`terminals` table)
- Scrollback saved on close, replayed on restore (`scrollback` table, capped at 5000 lines)
- On relaunch: workspaces restored from DB, terminals for active workspace respawned

---

## PTY Backend

Termspace uses the `portable-pty` crate (used in production by WezTerm) for native PTY creation.
`native_pty_system().openpty()` calls `posix_openpt()` under the hood, which works without
any special entitlements on macOS 26 — the initial assumption that it was restricted was incorrect.

No SSH, no Remote Login, no setup required.

---

## Bugs Fixed During Development

| Bug | Fix |
|---|---|
| Tauri v2 uses `lib.rs` not `main.rs` as crate root | All mods declared in lib.rs |
| Vite config lost `server.port: 1420` after scaffold | Restored in vite.config.ts |
| `react-resizable-panels` v4 API change | `direction` → `orientation`, `PanelGroup` → `Group`, `PanelResizeHandle` → `Separator` |
| Blank screen — invisible text | `var(--text-dim)` too dark; changed sidebar to `var(--text-inactive)` |
| Zustand infinite re-render | `?? []` creates new array reference each render; fixed with module-level `EMPTY_TERMINALS` constant |
| React StrictMode destroys PTY on double-invoke | Removed `<StrictMode>` from main.tsx |
| `removeTerminal` in TerminalPane caused terminals to disappear | Removed; parent App.tsx owns terminal lifetime |
| TerminalPane sizing broken in flex container | Changed to `display:flex; flexDirection:column` with inner `flex:1; minHeight:0` |
| PTY race: initial shell prompt lost | Two-phase spawn/start_reading split |
| `openpty` ENXIO on macOS 26 | SSH-based PTY workaround |
| Zombie SSH connections exhaust `maxproc` | Changed `Promise.all` terminal spawning to serial `for...of` loop in App.tsx |
| SSH-based PTY workaround | Replaced with portable-pty; posix_openpt works for unsigned binaries on macOS 26 |
| PTY pool exhaustion on startup | 30k+ stale terminal DB records from crash cycles caused openpty to fail with ENXIO; fixed by clearing terminals/scrollback tables on every launch in `db::init_db` |
| Blank terminals when adding via `+ terminal` | `react-resizable-panels` rebuilt the entire component tree on each terminal add (1→2→3→4), unmounting existing `TerminalPane`s and triggering their cleanup which killed the PTY; fixed by replacing panel layout with CSS grid — stable parent div keeps existing panes alive, React only mounts the new pane |

---

## Running the App

```bash
cd ~/Documents/Personal/Vibecode/termspace
npm run tauri dev
```

**Prerequisites:**
- Rust toolchain (`source "$HOME/.cargo/env"` if needed)
- Node.js + npm

---

## Pending Work / Known Issues

### High Priority

- ~~**Terminal resize**~~ — Fixed: `portable-pty` sends `TIOCSWINSZ` ioctl; shell receives `SIGWINCH` silently.

### Medium Priority

- ~~**Initial cwd not restored**~~ — **Fixed**: `CommandBuilder::cwd()` sets the working directory before exec; shell starts in the correct directory with no visible output.

- ~~**`+terminal` button in workspace header**~~ — **Fixed**: already wired; `WorkspaceView.tsx` calls `spawn_terminal` and adds to store.

- ~~**Workspace deletion**~~ — **Fixed**: delete button (×) appears on hover in the sidebar. Disabled when only one workspace remains.

- ~~**Shell output before `stty`**~~ — Fixed: no `stty` sent at all with native PTY.

### Medium Priority

- **Drag-to-resize between terminal panes** — removed when `react-resizable-panels` was replaced with CSS grid to fix the blank-terminal remounting bug. Grid is fixed 50/50 split. To restore resize: render a static 2×2 `PanelGroup` on all counts, hiding empty slots rather than rebuilding the tree.

### Low Priority

- **App icon** — uses default Tauri placeholder icons.

- **Scrollback restoration** — replayed on workspace load, but the initial scrollback write happens before the terminal is fully sized. Text may reflow on first resize.

- **Multiple workspaces on startup** — only the first workspace's terminals are spawned at launch. Other workspaces spawn lazily when selected (by design, but a loading indicator would improve UX).

---

## Key Files Quick Reference

| File | Purpose |
|---|---|
| `src/App.tsx` | Bootstrap, workspace/terminal lifecycle, all `invoke()` calls |
| `src/components/WorkspaceView/TerminalPane.tsx` | xterm.js setup, listen/start_terminal handshake |
| `src/components/WorkspaceView/TerminalGrid.tsx` | CSS grid layout for 1–4 terminals (fixed 50/50, no resize handles) |
| `src-tauri/src/pty_manager.rs` | Native PTY management via portable-pty, read/write/resize/kill |
| `src-tauri/src/commands.rs` | All Tauri commands exposed to frontend |
| `src-tauri/src/db.rs` | SQLite schema + all CRUD functions |
| `src-tauri/src/lib.rs` | App setup, state registration, invoke_handler! |

---

## SQLite Schema

```sql
-- Workspace definitions
CREATE TABLE workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    emoji TEXT NOT NULL DEFAULT '💻',
    color TEXT NOT NULL DEFAULT '#e8a045',
    position INTEGER NOT NULL,
    created_at INTEGER NOT NULL
);

-- Terminal instances (re-created on each launch)
CREATE TABLE terminals (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    shell TEXT NOT NULL DEFAULT 'zsh',
    cwd TEXT NOT NULL,
    position INTEGER NOT NULL,
    size_percent REAL NOT NULL DEFAULT 50,
    created_at INTEGER NOT NULL
);

-- Scrollback buffer (up to 5000 lines per terminal)
CREATE TABLE scrollback (
    terminal_id TEXT NOT NULL REFERENCES terminals(id) ON DELETE CASCADE,
    line_index INTEGER NOT NULL,
    data TEXT NOT NULL,
    PRIMARY KEY (terminal_id, line_index)
);
```

---

## Design Tokens

```css
--bg-main: #1a1612        /* app background */
--bg-sidebar: #221e18     /* sidebar background */
--bg-terminal: #161310    /* terminal pane background */
--accent: #e8a045         /* amber accent / active workspace */
--text-active: #e8a045    /* active text */
--text-inactive: #5a5040  /* inactive labels */
--border-inactive: #2a2420 /* inactive terminal border */
--sidebar-width: 200px
```
