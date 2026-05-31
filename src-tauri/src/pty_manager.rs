/// PTY backend for macOS 26+ Tahoe.
///
/// macOS 26 (Tahoe) restricts opening /dev/ptmx to processes that hold the
/// private entitlement `com.apple.private.kernel.global-proc-info`. Only
/// Apple-signed system apps (Terminal.app) have this entitlement.
///
/// Workaround: delegate PTY creation to sshd, a privileged system daemon that
/// CAN open /dev/ptmx. We spawn `/usr/bin/ssh -tt localhost` and communicate
/// with the remote shell over stdin/stdout pipes. sshd creates the PTY on the
/// server side; we get full interactive terminal behavior.
///
/// Prerequisite: the user must enable Remote Login in
/// System Settings → General → Sharing → Remote Login.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::Mutex;

pub struct PtyHandle {
    stdin: ChildStdin,
    _child: Child,
    reader: Option<ChildStdout>,
}

pub struct PtyManager {
    handles: Mutex<HashMap<String, PtyHandle>>,
    key_path: PathBuf,
}

impl PtyManager {
    pub fn new(data_dir: &Path) -> Self {
        let key_path = data_dir.join("termspace_id_ed25519");
        PtyManager { handles: Mutex::new(HashMap::new()), key_path }
    }

    /// Generates an ed25519 SSH key and adds it to ~/.ssh/authorized_keys
    /// if not already present. Safe to call repeatedly.
    fn ensure_ssh_key(key_path: &Path) -> Result<(), String> {
        if !key_path.exists() {
            let out = Command::new("ssh-keygen")
                .args([
                    "-t", "ed25519",
                    "-f", key_path.to_str().unwrap_or_default(),
                    "-N", "",
                    "-q",
                ])
                .output()
                .map_err(|e| format!("ssh-keygen: {e}"))?;
            if !out.status.success() {
                return Err(format!(
                    "ssh-keygen failed: {}",
                    String::from_utf8_lossy(&out.stderr)
                ));
            }
        }

        // Public key sits next to the private key
        let pub_path = key_path.with_extension("pub");
        let pub_key = std::fs::read_to_string(&pub_path)
            .map_err(|e| format!("read pub key: {e}"))?;
        let pub_key = pub_key.trim();

        let home = std::env::var("HOME").unwrap_or_else(|_| "/".to_string());
        let ssh_dir = PathBuf::from(&home).join(".ssh");
        std::fs::create_dir_all(&ssh_dir).map_err(|e| format!("mkdir .ssh: {e}"))?;

        // Set correct permissions on ~/.ssh
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&ssh_dir, std::fs::Permissions::from_mode(0o700));
        }

        let auth_keys = ssh_dir.join("authorized_keys");
        let existing = std::fs::read_to_string(&auth_keys).unwrap_or_default();
        if !existing.contains(pub_key) {
            let mut f = std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(&auth_keys)
                .map_err(|e| format!("open authorized_keys: {e}"))?;
            writeln!(f, "{pub_key}").map_err(|e| format!("write authorized_keys: {e}"))?;

            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let _ = std::fs::set_permissions(&auth_keys, std::fs::Permissions::from_mode(0o600));
            }
        }
        Ok(())
    }

    /// Opens an SSH session to localhost. The PTY is created by sshd, which
    /// has the required macOS 26 entitlement. Does NOT start streaming yet —
    /// start_reading does that after the frontend attaches its listener.
    pub fn spawn(
        &self,
        terminal_id: String,
        shell: &str,
        cwd: &str,
        _cols: u16,
        _rows: u16,
    ) -> Result<(), String> {
        Self::ensure_ssh_key(&self.key_path)?;

        let resolved_cwd = if cwd.is_empty() {
            std::env::var("HOME").unwrap_or_else(|_| "/".to_string())
        } else {
            cwd.to_string()
        };
        let resolved_shell = if shell.is_empty() {
            std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string())
        } else {
            shell.to_string()
        };
        let user = std::env::var("USER").map_err(|_| "USER env var not set".to_string())?;
        let home = std::env::var("HOME").unwrap_or_default();

        // Embed cd in the remote command so no visible `cd` line appears in the terminal.
        // If cwd is home or empty, just start the shell normally.
        let shell_arg = if !resolved_cwd.is_empty() && resolved_cwd != home {
            format!("cd {} && exec {} -l", shell_quote(&resolved_cwd), resolved_shell)
        } else {
            format!("{resolved_shell} -l")
        };

        // sshd only AcceptEnv LANG LC_* by default — use SetEnv for TERM.
        // Terminals are spawned serially from App.tsx so MaxStartups is not an issue.
        let key_str = self.key_path.to_str().unwrap_or_default().to_string();
        let mut child = Command::new("/usr/bin/ssh")
            .args([
                "-tt",
                "-i", &key_str,
                "-o", "StrictHostKeyChecking=no",
                "-o", "UserKnownHostsFile=/dev/null",
                "-o", "LogLevel=ERROR",
                "-o", "PasswordAuthentication=no",
                "-o", "BatchMode=yes",
                "-o", "ConnectTimeout=5",
                "-o", "SetEnv TERM=xterm-256color",
                &format!("{user}@127.0.0.1"),
                &shell_arg,
            ])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!(
                "SSH failed ({e}). \
                 Enable Remote Login in System Settings → General → Sharing → Remote Login."
            ))?;

        let stdout = child.stdout.take().unwrap();
        let stdin = child.stdin.take().unwrap();

        self.handles.lock().unwrap().insert(
            terminal_id,
            PtyHandle { stdin, _child: child, reader: Some(stdout) },
        );
        Ok(())
    }

    /// Called after the frontend attaches its pty-output-<id> listener. Starts
    /// the background reader thread that emits PTY output to the frontend.
    pub fn start_reading<F>(&self, terminal_id: &str, on_data: F) -> Result<(), String>
    where
        F: Fn(String) + Send + 'static,
    {
        let reader_stdout = {
            let mut handles = self.handles.lock().unwrap();
            let handle = handles
                .get_mut(terminal_id)
                .ok_or_else(|| format!("No PTY for {terminal_id}"))?;
            handle.reader.take()
                .ok_or_else(|| format!("Reader already started for {terminal_id}"))?
        };

        std::thread::spawn(move || {
            let mut reader = reader_stdout;
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
            .stdin
            .write_all(data.as_bytes())
            .map_err(|e| e.to_string())
    }

    /// Resize by sending stty to the remote shell. The command is echoed
    /// in the terminal but the shell will immediately update its dimensions.
    pub fn resize(&self, terminal_id: &str, cols: u16, rows: u16) -> Result<(), String> {
        let cmd = format!("stty cols {cols} rows {rows}\n");
        let mut handles = self.handles.lock().unwrap();
        handles
            .get_mut(terminal_id)
            .ok_or_else(|| format!("No PTY for {terminal_id}"))?
            .stdin
            .write_all(cmd.as_bytes())
            .map_err(|e| e.to_string())
    }

    pub fn kill(&self, terminal_id: &str) {
        // Dropping the handle closes stdin, which causes the remote shell to
        // exit, which causes sshd to tear down the PTY.
        self.handles.lock().unwrap().remove(terminal_id);
    }
}

/// Wraps a path in single quotes for safe use in a shell command.
fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}
