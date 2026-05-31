# Native PTY Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the SSH-based PTY backend with a native PTY using `portable-pty`, eliminating the Remote Login requirement and fixing both the visible-`stty` resize bug and the visible-`cd` restore bug.

**Architecture:** Add `portable-pty = "0.9"` to Cargo.toml. Rewrite `pty_manager.rs` to open a native PTY via `native_pty_system().openpty()`, spawn the shell directly with `CommandBuilder` (which handles cwd and env before exec), and store master + writer + reader in the same `PtyHandle` map. The two-phase spawn/start_reading handshake and all public method signatures stay identical so `commands.rs` and the frontend are untouched.

**Tech Stack:** Rust, `portable-pty 0.9`, `tauri 2`

---

## File Map

| File | Change |
|---|---|
| `src-tauri/Cargo.toml` | Add `portable-pty = "0.9"` |
| `src-tauri/src/pty_manager.rs` | Full rewrite — remove SSH, use portable-pty |
| `src-tauri/src/lib.rs` | `PtyManager::new(&data_dir)` → `PtyManager::new()` |
| `handoff.md` | Correct macOS 26 PTY assumption; mark bugs fixed |

---

## Task 0: Initialise git repo

The project has no git history. All subsequent tasks commit their changes.

**Files:** none (repo init only)

- [ ] **Init and make first commit**

```bash
cd /Users/samirkumal/Documents/Personal/Vibecode/termspace
git init
git add -A
git commit -m "chore: initial commit before native PTY migration"
```

Expected: `[main (root-commit) xxxxxxx] chore: initial commit before native PTY migration`

---

## Task 1: Add dependency and verify it compiles

**Files:**
- Modify: `src-tauri/Cargo.toml`

- [ ] **Add portable-pty to Cargo.toml**

Open `src-tauri/Cargo.toml`. Add `portable-pty = "0.9"` under `[dependencies]`. The block should now look like:

```toml
[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-opener = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
rusqlite = { version = "0.31", features = ["bundled"] }
uuid = { version = "1", features = ["v4"] }
portable-pty = "0.9"
```

- [ ] **Verify the dependency compiles**

```bash
cd /Users/samirkumal/Documents/Personal/Vibecode/termspace/src-tauri
source "$HOME/.cargo/env" && cargo check 2>&1 | tail -5
```

Expected: `Finished` with no errors. `portable-pty v0.9.x` now appears in `Cargo.lock`.

- [ ] **Commit**

```bash
cd /Users/samirkumal/Documents/Personal/Vibecode/termspace
git add src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore: add portable-pty 0.9 dependency"
```

---

## Task 2: Write failing tests for the new PtyManager

**Files:**
- Modify: `src-tauri/src/pty_manager.rs` (append test module — no impl change yet)

- [ ] **Append the test module to pty_manager.rs**

Add the following block at the very end of `src-tauri/src/pty_manager.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};
    use std::time::{Duration, Instant};

    fn mgr() -> PtyManager {
        PtyManager::new()
    }

    #[test]
    fn spawn_and_kill() {
        let m = mgr();
        m.spawn("t1".into(), "/bin/sh", "", 80, 24).expect("spawn failed");
        m.kill("t1");
    }

    #[test]
    fn kill_missing_is_noop() {
        let m = mgr();
        m.kill("does-not-exist");
    }

    #[test]
    fn write_without_spawn_returns_err() {
        let m = mgr();
        let result = m.write("ghost", "hello\n");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("No PTY"));
    }

    #[test]
    fn resize_after_spawn_succeeds() {
        let m = mgr();
        m.spawn("t2".into(), "/bin/sh", "", 80, 24).expect("spawn failed");
        m.resize("t2", 120, 40).expect("resize failed");
        m.kill("t2");
    }

    #[test]
    fn start_reading_twice_returns_err() {
        let m = mgr();
        m.spawn("t3".into(), "/bin/sh", "", 80, 24).expect("spawn failed");
        m.start_reading("t3", |_| {}).expect("first start_reading failed");
        let result = m.start_reading("t3", |_| {});
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Reader already started"));
        m.kill("t3");
    }

    #[test]
    fn write_and_read_output() {
        let m = mgr();
        m.spawn("t4".into(), "/bin/sh", "", 80, 24).expect("spawn failed");

        let output: Arc<Mutex<String>> = Arc::new(Mutex::new(String::new()));
        let out2 = Arc::clone(&output);
        m.start_reading("t4", move |data| {
            out2.lock().unwrap().push_str(&data);
        })
        .expect("start_reading failed");

        std::thread::sleep(Duration::from_millis(300));
        m.write("t4", "echo pty_native_test\n").expect("write failed");

        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            if output.lock().unwrap().contains("pty_native_test") {
                break;
            }
            assert!(Instant::now() < deadline, "timeout: shell never echoed output");
            std::thread::sleep(Duration::from_millis(50));
        }
        m.kill("t4");
    }
}
```

- [ ] **Run tests — confirm they fail to compile**

```bash
cd /Users/samirkumal/Documents/Personal/Vibecode/termspace/src-tauri
source "$HOME/.cargo/env" && cargo test -q 2>&1 | head -20
```

Expected: compile error — the existing `PtyManager::new` takes a `&Path` argument but the tests call `PtyManager::new()` with no arguments. This is the correct red state.

---

## Task 3: Rewrite pty_manager.rs with native PTY

**Files:**
- Modify: `src-tauri/src/pty_manager.rs`

- [ ] **Overwrite pty_manager.rs with the complete file below**

Write the following as the entire contents of `src-tauri/src/pty_manager.rs` (this replaces the SSH impl and includes the test module from Task 2):

```rust
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Mutex;

pub struct PtyHandle {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    _child: Box<dyn portable_pty::Child + Send + Sync>,
    reader: Option<Box<dyn Read + Send>>,
}

pub struct PtyManager {
    handles: Mutex<HashMap<String, PtyHandle>>,
}

impl PtyManager {
    pub fn new() -> Self {
        PtyManager { handles: Mutex::new(HashMap::new()) }
    }

    pub fn spawn(
        &self,
        terminal_id: String,
        shell: &str,
        cwd: &str,
        cols: u16,
        rows: u16,
    ) -> Result<(), String> {
        let resolved_shell = if shell.is_empty() {
            std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string())
        } else {
            shell.to_string()
        };
        let resolved_cwd = if cwd.is_empty() {
            std::env::var("HOME").unwrap_or_else(|_| "/".to_string())
        } else {
            cwd.to_string()
        };

        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
            .map_err(|e| format!("openpty failed: {e}"))?;

        let mut cmd = CommandBuilder::new(&resolved_shell);
        cmd.arg("-l");
        cmd.cwd(&resolved_cwd);
        cmd.env("TERM", "xterm-256color");

        let child = pair.slave
            .spawn_command(cmd)
            .map_err(|e| format!("spawn failed: {e}"))?;

        // Close slave fd in the parent — the child process holds its own copy.
        drop(pair.slave);

        let reader = pair.master
            .try_clone_reader()
            .map_err(|e| format!("clone reader: {e}"))?;
        let writer = pair.master
            .take_writer()
            .map_err(|e| format!("take writer: {e}"))?;

        self.handles.lock().unwrap().insert(
            terminal_id,
            PtyHandle { master: pair.master, writer, _child: child, reader: Some(reader) },
        );
        Ok(())
    }

    /// Called after the frontend attaches its pty-output-<id> listener. Starts
    /// the background reader thread that emits PTY output to the frontend.
    pub fn start_reading<F>(&self, terminal_id: &str, on_data: F) -> Result<(), String>
    where
        F: Fn(String) + Send + 'static,
    {
        let reader = {
            let mut handles = self.handles.lock().unwrap();
            let handle = handles
                .get_mut(terminal_id)
                .ok_or_else(|| format!("No PTY for {terminal_id}"))?;
            handle.reader.take()
                .ok_or_else(|| format!("Reader already started for {terminal_id}"))?
        };

        std::thread::spawn(move || {
            let mut reader = reader;
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => on_data(String::from_utf8_lossy(&buf[..n]).to_string()),
                }
            }
        });
        Ok(())
    }

    pub fn write(&self, terminal_id: &str, data: &str) -> Result<(), String> {
        let mut handles = self.handles.lock().unwrap();
        handles
            .get_mut(terminal_id)
            .ok_or_else(|| format!("No PTY for {terminal_id}"))?
            .writer
            .write_all(data.as_bytes())
            .map_err(|e| e.to_string())
    }

    /// Resize via TIOCSWINSZ ioctl — shell receives SIGWINCH silently.
    pub fn resize(&self, terminal_id: &str, cols: u16, rows: u16) -> Result<(), String> {
        let handles = self.handles.lock().unwrap();
        handles
            .get(terminal_id)
            .ok_or_else(|| format!("No PTY for {terminal_id}"))?
            .master
            .resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
            .map_err(|e| e.to_string())
    }

    pub fn kill(&self, terminal_id: &str) {
        self.handles.lock().unwrap().remove(terminal_id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};
    use std::time::{Duration, Instant};

    fn mgr() -> PtyManager {
        PtyManager::new()
    }

    #[test]
    fn spawn_and_kill() {
        let m = mgr();
        m.spawn("t1".into(), "/bin/sh", "", 80, 24).expect("spawn failed");
        m.kill("t1");
    }

    #[test]
    fn kill_missing_is_noop() {
        let m = mgr();
        m.kill("does-not-exist");
    }

    #[test]
    fn write_without_spawn_returns_err() {
        let m = mgr();
        let result = m.write("ghost", "hello\n");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("No PTY"));
    }

    #[test]
    fn resize_after_spawn_succeeds() {
        let m = mgr();
        m.spawn("t2".into(), "/bin/sh", "", 80, 24).expect("spawn failed");
        m.resize("t2", 120, 40).expect("resize failed");
        m.kill("t2");
    }

    #[test]
    fn start_reading_twice_returns_err() {
        let m = mgr();
        m.spawn("t3".into(), "/bin/sh", "", 80, 24).expect("spawn failed");
        m.start_reading("t3", |_| {}).expect("first start_reading failed");
        let result = m.start_reading("t3", |_| {});
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Reader already started"));
        m.kill("t3");
    }

    #[test]
    fn write_and_read_output() {
        let m = mgr();
        m.spawn("t4".into(), "/bin/sh", "", 80, 24).expect("spawn failed");

        let output: Arc<Mutex<String>> = Arc::new(Mutex::new(String::new()));
        let out2 = Arc::clone(&output);
        m.start_reading("t4", move |data| {
            out2.lock().unwrap().push_str(&data);
        })
        .expect("start_reading failed");

        std::thread::sleep(Duration::from_millis(300));
        m.write("t4", "echo pty_native_test\n").expect("write failed");

        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            if output.lock().unwrap().contains("pty_native_test") {
                break;
            }
            assert!(Instant::now() < deadline, "timeout: shell never echoed output");
            std::thread::sleep(Duration::from_millis(50));
        }
        m.kill("t4");
    }
}
```

- [ ] **Run the tests**

```bash
cd /Users/samirkumal/Documents/Personal/Vibecode/termspace/src-tauri
source "$HOME/.cargo/env" && cargo test -- --nocapture 2>&1
```

Expected: all 6 tests pass. `write_and_read_output` may take up to 5 seconds.

If `write_and_read_output` times out, increase the `Duration::from_millis(300)` sleep to `500`.

- [ ] **Commit**

```bash
cd /Users/samirkumal/Documents/Personal/Vibecode/termspace
git add src-tauri/src/pty_manager.rs
git commit -m "feat: replace SSH PTY with native portable-pty"
```

---

## Task 4: Update lib.rs

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Remove data_dir argument from PtyManager::new()**

In `src-tauri/src/lib.rs`, change:

```rust
app.manage(PtyManager::new(&data_dir));
```

to:

```rust
app.manage(PtyManager::new());
```

- [ ] **Full build — 0 errors, 0 warnings**

```bash
cd /Users/samirkumal/Documents/Personal/Vibecode/termspace/src-tauri
source "$HOME/.cargo/env" && cargo build 2>&1
```

Expected: `Finished dev profile` with no errors and no warnings.

- [ ] **Commit**

```bash
cd /Users/samirkumal/Documents/Personal/Vibecode/termspace
git add src-tauri/src/lib.rs
git commit -m "chore: update PtyManager::new() signature in lib.rs"
```

---

## Task 5: Update handoff.md

**Files:**
- Modify: `handoff.md`

- [ ] **Replace the macOS 26 PTY Problem section**

In `termspace/handoff.md`, find the section `## The macOS 26 PTY Problem` (spans from that heading through the **Known Limitations of SSH Approach** table). Replace the entire section with:

```markdown
## PTY Backend

Termspace uses the `portable-pty` crate (used in production by WezTerm) for native PTY creation.
`native_pty_system().openpty()` calls `posix_openpt()` under the hood, which works without
any special entitlements on macOS 26 — the initial assumption that it was restricted was incorrect.

No SSH, no Remote Login, no setup required.
```

- [ ] **Update the Bugs Fixed table**

Add a row to the **Bugs Fixed During Development** table in `handoff.md`:

```
| SSH-based PTY workaround | Replaced with portable-pty; posix_openpt works for unsigned binaries on macOS 26 |
```

- [ ] **Update Pending Work**

In the **Pending Work / Known Issues** section, mark the following as fixed:
- `Terminal resize` — fixed: portable-pty sends `TIOCSWINSZ` ioctl; shell receives `SIGWINCH` silently
- `Shell output before stty` — fixed: no stty sent at all

- [ ] **Commit**

```bash
cd /Users/samirkumal/Documents/Personal/Vibecode/termspace
git add handoff.md
git commit -m "docs: update handoff — native PTY, remove SSH workaround notes"
```

---

## Task 6: Smoke test the running app

- [ ] **Start the dev server**

```bash
cd /Users/samirkumal/Documents/Personal/Vibecode/termspace
source "$HOME/.cargo/env" && npm run tauri dev
```

- [ ] **Verify these behaviours in the running app**

1. Terminal opens with no SSH prompt or Remote Login error
2. Shell prompt appears (`zsh` or `bash`)
3. Type `pwd` → prints the correct directory (home, or saved cwd on workspace restore)
4. Resize the app window → **no** `stty cols X rows Y` appears in the terminal
5. Type `vim` → vim opens and renders correctly (confirms `SIGWINCH` works)
6. Click `+ terminal` in a workspace → second terminal spawns correctly
7. Close the app and relaunch → workspace restores, terminal starts in correct cwd silently

- [ ] **Tag completion**

```bash
cd /Users/samirkumal/Documents/Personal/Vibecode/termspace
git tag native-pty-done
```
