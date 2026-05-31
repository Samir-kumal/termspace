mod commands;
mod db;
mod pty_manager;

use commands::DbState;
use pty_manager::PtyManager;
use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir().expect("no app data dir");
            std::fs::create_dir_all(&data_dir).unwrap();
            let conn = db::init_db(&data_dir.join("state.db")).expect("db init failed");
            app.manage(DbState(Mutex::new(conn)));
            app.manage(PtyManager::new());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_workspaces,
            commands::create_workspace,
            commands::update_workspace,
            commands::delete_workspace,
            commands::get_terminals,
            commands::spawn_terminal,
            commands::start_terminal,
            commands::close_terminal,
            commands::write_pty,
            commands::resize_pty,
            commands::load_scrollback,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
