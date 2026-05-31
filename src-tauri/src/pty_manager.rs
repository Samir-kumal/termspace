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
