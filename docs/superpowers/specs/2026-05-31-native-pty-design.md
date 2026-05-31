# Native PTY — Design Spec
**Date:** 2026-05-31  
**Status:** Approved

---

## Problem

The current PTY backend spawns `/usr/bin/ssh -tt localhost` to work around an assumed macOS 26 restriction on `/dev/ptmx`. Testing proves that assumption is wrong — `posix_openpt()` works fine from an unsigned Rust binary. SSH is unnecessary, requires Remote Login to be enabled, and introduces two known bugs: visible `stty` on resize and visible `cd` on cwd restore.

---

## Solution

Replace the SSH-based `pty_manager.rs` with a native PTY implementation using the `portable-pty` crate (used by WezTerm in production). No SSH, no Remote Login, no setup required by the user.

---

## Architecture

### Dependency

Add to `src-tauri/Cargo.toml`:
```toml
portable-pty = "0.8"
```

### PtyHandle (new shape)

```rust
pub struct PtyHandle {
    master: Box<dyn MasterPty + Send>,       // resize via TIOCSWINSZ ioctl
    writer: Box<dyn Write + Send>,           // keystroke input
    _child: Box<dyn Child + Send + Sync>,    // keeps shell process alive
    reader: Option<Box<dyn Read + Send>>,    // taken by start_reading()
}
```

### PtyManager (same public interface)

Same struct, same methods (`spawn`, `start_reading`, `write`, `resize`, `kill`). No changes needed in `commands.rs`.

---

## Spawn Flow

```
pty_system.openpty(PtySize { cols, rows })
  → PtyPair { master, slave }

CommandBuilder::new(shell)
  .arg("-l")                          // login shell
  .cwd(resolved_cwd)                  // shell starts in correct dir — no cd needed
  .env("TERM", "xterm-256color")

slave.spawn_command(cmd) → child
drop(slave)                           // close slave fd in parent process

master.try_clone_reader() → reader    // stored in PtyHandle.reader
master.take_writer()      → writer    // stored in PtyHandle.writer

insert PtyHandle into handles map
```

### Cwd handling

`CommandBuilder::cwd()` sets the working directory before `exec()`. The shell starts directly in the correct directory — no `cd` command is sent, nothing appears in the terminal output.

---

## Start-Reading Flow

Same two-phase handshake as the existing implementation:

1. Frontend calls `listen("pty-output-<id>")` to attach event listener
2. Frontend calls `start_terminal(terminal_id)`
3. `start_reading()` takes `reader` from `PtyHandle` and spawns background thread
4. Background thread reads chunks, emits `pty-output-<id>` events to frontend

---

## Resize Flow

```rust
pub fn resize(&self, terminal_id: &str, cols: u16, rows: u16) -> Result<(), String> {
    let handles = self.handles.lock().unwrap();
    handles.get(terminal_id)?
        .master
        .resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
}
```

`portable-pty` sends `TIOCSWINSZ` ioctl to the master fd. The shell receives `SIGWINCH` and updates its line width silently. **No `stty` command, no visible output.** This fixes the resize bug as a side effect.

---

## Files Changed

| File | Change |
|---|---|
| `src-tauri/Cargo.toml` | Add `portable-pty = "0.8"` |
| `src-tauri/src/pty_manager.rs` | Full rewrite — remove SSH, use portable-pty |
| `src-tauri/src/commands.rs` | Remove SSH-specific error message from spawn error |
| `handoff.md` | Correct the macOS 26 PTY assumption; update known issues |

`commands.rs`, `db.rs`, `lib.rs`, and all frontend files are **unchanged**.

---

## What Gets Fixed

| Bug | Status |
|---|---|
| Requires Remote Login / sshd | Fixed — no SSH at all |
| Visible `stty cols X rows Y` on resize | Fixed — silent TIOCSWINSZ ioctl |
| Visible `cd /path` on workspace restore | Fixed — cwd set before exec |
| Serial terminal spawning (SSH MaxStartups workaround) | Fixed — parallel spawn is now safe |

---

## What Stays the Same

- Two-phase spawn/start_reading handshake (prevents lost initial prompt)
- `close_terminal` scrollback save
- All DB schema and persistence logic
- All frontend components
- All Tauri commands and their signatures
