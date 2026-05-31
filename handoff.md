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
| Panel resizing | react-resizable-panels v4 |
| State management | Zustand |
| Database | SQLite via rusqlite (bundled) |
| PTY (macOS 26+) | `/usr/bin/ssh -tt localhost` via sshd |

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
│   │   ├── pty_manager.rs        # SSH-based PTY manager (see macOS 26 note)
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
    → PtyManager::write() → ssh process stdin
      → sshd PTY master → shell

shell output
  → sshd PTY master → ssh process stdout
    → background read thread → app.emit('pty-output-<id>')
      → TerminalPane listen() → xterm.write()
```

### PTY Two-Phase Design

To avoid a race where the shell emits its initial prompt before the frontend listener is attached:

1. **`spawn_terminal`** — opens SSH subprocess, stores reader in `PtyHandle.reader: Option<ChildStdout>`, does NOT start reading yet
2. **`start_terminal`** — called by frontend AFTER `listen()` is registered, takes the reader and starts the background emit thread

### Persistence

- All workspaces stored in SQLite (`workspaces` table)
- All terminal metadata stored (`terminals` table)
- Scrollback saved on close, replayed on restore (`scrollback` table, capped at 5000 lines)
- On relaunch: workspaces restored from DB, terminals for active workspace respawned

---

## The macOS 26 PTY Problem

### What Happened

macOS 26 Tahoe (Darwin 25.5.0, Build 25F71) restricts opening `/dev/ptmx` to processes with the private Apple entitlement `com.apple.private.kernel.global-proc-info`. Only Apple-signed system apps (Terminal.app) have this entitlement. Third-party binaries — including adhoc-signed Tauri dev builds — get `ENXIO` ("Device not configured") when calling `open("/dev/ptmx")`.

This affects **all** PTY creation methods for unsigned binaries:
- `open("/dev/ptmx")` → ENXIO
- `openpty()` via libutil → ENXIO (calls /dev/ptmx internally)
- `posix_openpt()` → ENXIO (same)
- BSD legacy devices `/dev/ptyXX` → EAGAIN (all in use or also restricted)
- Even `/usr/bin/script` (a platform binary without the specific entitlement) fails

### The Workaround

Delegate PTY creation to `sshd`, a privileged system daemon that **does** have the entitlement. The PTY manager spawns `/usr/bin/ssh -tt localhost` with a pre-generated key. `sshd` creates the PTY on the server side; the Rust process communicates via stdin/stdout pipes.

### Setup Required (One-Time)

The user must enable **Remote Login** in:
> System Settings → General → Sharing → Remote Login → On

On first terminal spawn, the app auto-generates an SSH key at:
```
~/Library/Application Support/com.termspace.app/termspace_id_ed25519
```
and adds the public key to `~/.ssh/authorized_keys`.

### Known Limitations of SSH Approach

| Limitation | Impact |
|---|---|
| Terminal resize sends `stty cols X rows Y` via shell stdin | Command visible in terminal output on resize |
| No initial `cwd` support (shell starts in `~`) | User must `cd` manually after switching workspaces |
| Serial terminal spawning (not parallel) | Slightly slower multi-terminal restore |
| Requires Remote Login enabled | Extra one-time setup step for user |

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

---

## Running the App

```bash
cd ~/Documents/Personal/Vibecode/termspace
npm run tauri dev
```

**Prerequisites:**
- Rust toolchain (`source "$HOME/.cargo/env"` if needed)
- Node.js + npm
- Remote Login enabled (System Settings → General → Sharing)

---

## Pending Work / Known Issues

### High Priority

- **Terminal resize** — currently sends a visible `stty` command to the shell. Should silently resize by sending SSH window-change request at the protocol level (requires `russh` crate or a proper SSH library instead of spawning `/usr/bin/ssh`).

### Medium Priority

- ~~**Initial cwd not restored**~~ — **Fixed**: `cd` is now embedded in the SSH remote command (`cd '/path' && exec zsh -l`), so the shell starts in the correct directory silently with no visible output.

- ~~**`+terminal` button in workspace header**~~ — **Fixed**: already wired; `WorkspaceView.tsx` calls `spawn_terminal` and adds to store.

- ~~**Workspace deletion**~~ — **Fixed**: delete button (×) appears on hover in the sidebar. Disabled when only one workspace remains.

- **Shell output before `stty`** — on resize, the `stty cols X rows Y\n` command is echoed by the PTY. Should be suppressed or replaced with a silent mechanism.

- **SSH connection timeout UX** — if Remote Login is disabled, the error banner appears but the workspace area is empty. Should show a helpful "Enable Remote Login" instruction with a direct link.

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
| `src/components/WorkspaceView/TerminalGrid.tsx` | 1/2/3/4 terminal layout using react-resizable-panels |
| `src-tauri/src/pty_manager.rs` | SSH subprocess management, read/write/kill |
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
