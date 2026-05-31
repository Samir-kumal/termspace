use crate::db::{self, Terminal, Workspace};
use crate::pty_manager::PtyManager;
use rusqlite::Connection;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

pub struct DbState(pub Mutex<Connection>);

#[tauri::command]
pub fn get_workspaces(db: State<DbState>) -> Result<Vec<Workspace>, String> {
    db::get_workspaces(&db.0.lock().unwrap()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_workspace(
    db: State<DbState>,
    name: String,
    emoji: String,
    color: String,
) -> Result<Workspace, String> {
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
pub fn delete_workspace(db: State<DbState>, id: String) -> Result<(), String> {
    db::delete_workspace(&db.0.lock().unwrap(), &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_terminals(db: State<DbState>, workspace_id: String) -> Result<Vec<Terminal>, String> {
    db::get_terminals(&db.0.lock().unwrap(), &workspace_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn spawn_terminal(
    app: AppHandle,
    db: State<DbState>,
    pty: State<PtyManager>,
    workspace_id: String,
    shell: String,
    cwd: String,
) -> Result<Terminal, String> {
    // resolve empty cwd to user home directory
    let resolved_cwd = if cwd.is_empty() {
        std::env::var("HOME").unwrap_or_else(|_| "/".to_string())
    } else {
        cwd.clone()
    };

    // spawn PTY first — if it fails, no DB record is created (no orphan)
    let temp_id = uuid::Uuid::new_v4().to_string();
    let event_name = format!("pty-output-{temp_id}");
    let app_handle = app.clone();
    pty.spawn(temp_id.clone(), &shell, &resolved_cwd, 80, 24, move |data| {
        let _ = app_handle.emit(&event_name, data);
    })?;

    let terminal = {
        let conn = db.0.lock().unwrap();
        db::create_terminal_with_id(&conn, &temp_id, &workspace_id, &shell, &resolved_cwd)
            .map_err(|e| {
                pty.kill(&temp_id); // rollback PTY if DB insert fails
                e.to_string()
            })?
    };

    Ok(terminal)
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
