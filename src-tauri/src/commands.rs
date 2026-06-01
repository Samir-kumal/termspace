use crate::db::{self, Terminal, Workspace};
use crate::pty_manager::PtyManager;
use rusqlite::Connection;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

pub struct DbState(pub Mutex<Connection>);

#[tauri::command]
pub fn get_workspaces(db: State<DbState>) -> Result<Vec<Workspace>, String> {
    println!(">>> RUST: get_workspaces called");
    db::get_workspaces(&db.0.lock().unwrap()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_workspace(
    db: State<DbState>,
    name: String,
    emoji: String,
    color: String,
) -> Result<Workspace, String> {
    println!(">>> RUST: create_workspace called for {}", name);
    db::create_workspace(&db.0.lock().unwrap(), &name, &emoji, &color)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_workspace(
    db: State<DbState>,
    id: String,
    name: String,
    emoji: String,
    color: String,
) -> Result<(), String> {
    db::update_workspace(&db.0.lock().unwrap(), &id, &name, &emoji, &color)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_workspace(
    db: State<DbState>,
    pty: State<PtyManager>,
    id: String,
) -> Result<(), String> {
    {
        let conn = db.0.lock().unwrap();
        // Fetch terminals to kill their processes
        if let Ok(terminals) = db::get_terminals(&conn, &id) {
            for t in terminals {
                pty.kill(&t.id);
            }
        }
        db::delete_workspace(&conn, &id).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn get_terminals(db: State<DbState>, workspace_id: String) -> Result<Vec<Terminal>, String> {
    println!(">>> RUST: get_terminals called for ws {}", workspace_id);
    db::get_terminals(&db.0.lock().unwrap(), &workspace_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn spawn_terminal(
    db: State<DbState>,
    pty: State<PtyManager>,
    workspace_id: String,
    shell: String,
    cwd: String,
) -> Result<Terminal, String> {
    println!(">>> RUST: spawn_terminal called for ws {} (shell: {}, cwd: {})", workspace_id, shell, cwd);
    // resolve empty cwd to user home directory
    let resolved_cwd = if cwd.is_empty() {
        std::env::var("HOME").unwrap_or_else(|_| "/".to_string())
    } else {
        cwd.clone()
    };

    // resolve empty/invalid shell to the user's login shell, then a sane default
    let resolved_shell = if shell.is_empty() {
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string())
    } else {
        shell.clone()
    };

    // spawn PTY first — if it fails, no DB record is created (no orphan).
    // Output is NOT streamed yet; the frontend calls `start_terminal` after
    // attaching its listener (see start_terminal below).
    let temp_id = uuid::Uuid::new_v4().to_string();
    pty.spawn(temp_id.clone(), &resolved_shell, &resolved_cwd, 80, 24)?;

    let terminal = {
        let conn = db.0.lock().unwrap();
        db::create_terminal_with_id(&conn, &temp_id, &workspace_id, &resolved_shell, &resolved_cwd)
            .map_err(|e| {
                pty.kill(&temp_id); // rollback PTY if DB insert fails
                e.to_string()
            })?
    };

    Ok(terminal)
}

#[tauri::command]
pub fn respawn_terminal(
    pty: State<PtyManager>,
    id: String,
    shell: String,
    cwd: String,
) -> Result<(), String> {
    println!(">>> RUST: respawn_terminal called for term {}", id);
    // If the backend is still running (e.g., from a Vite HMR or frontend reload),
    // kill the old PTY process so we can cleanly respawn and attach new listeners.
    pty.kill(&id);

    let resolved_cwd = if cwd.is_empty() {
        std::env::var("HOME").unwrap_or_else(|_| "/".to_string())
    } else {
        cwd.clone()
    };

    let resolved_shell = if shell.is_empty() {
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string())
    } else {
        shell.clone()
    };

    pty.spawn(id, &resolved_shell, &resolved_cwd, 80, 24)?;
    Ok(())
}

/// Starts streaming PTY output for a terminal. The frontend calls this once,
/// immediately after attaching its `pty-output-<id>` event listener, so the
/// shell's initial prompt is not lost to a race.
#[tauri::command]
pub fn start_terminal(
    app: AppHandle,
    pty: State<PtyManager>,
    terminal_id: String,
) -> Result<(), String> {
    let event_name = format!("pty-output-{terminal_id}");
    pty.start_reading(&terminal_id, move |data| {
        let _ = app.emit(&event_name, data);
    })
}

#[tauri::command]
pub fn close_terminal(
    db: State<DbState>,
    pty: State<PtyManager>,
    id: String,
    scrollback: Vec<String>,
) -> Result<(), String> {
    {
        let conn = db.0.lock().unwrap();
        db::save_scrollback(&conn, &id, &scrollback).map_err(|e| e.to_string())?;
        db::delete_terminal(&conn, &id).map_err(|e| e.to_string())?;
    } // lock released here before pty.kill
    pty.kill(&id);
    Ok(())
}

#[tauri::command]
pub fn save_scrollback(
    db: State<DbState>,
    id: String,
    scrollback: Vec<String>,
) -> Result<(), String> {
    let conn = db.0.lock().unwrap();
    db::save_scrollback(&conn, &id, &scrollback).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_pty(
    pty: State<PtyManager>,
    terminal_id: String,
    data: String,
) -> Result<(), String> {
    pty.write(&terminal_id, &data)
}

#[tauri::command]
pub fn resize_pty(
    pty: State<PtyManager>,
    terminal_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    pty.resize(&terminal_id, cols, rows)
}

#[tauri::command]
pub fn load_scrollback(
    db: State<DbState>,
    terminal_id: String,
) -> Result<Vec<String>, String> {
    db::load_scrollback(&db.0.lock().unwrap(), &terminal_id).map_err(|e| e.to_string())
}
