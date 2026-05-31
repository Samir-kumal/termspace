use rusqlite::{Connection, Result};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub emoji: String,
    pub color: String,
    pub position: i64,
    pub created_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Terminal {
    pub id: String,
    pub workspace_id: String,
    pub shell: String,
    pub cwd: String,
    pub position: i64,
    pub size_percent: f64,
    pub created_at: i64,
}

pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64
}

pub fn init_db(path: &Path) -> Result<Connection> {
    let conn = Connection::open(path)?;
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS workspaces (
            id         TEXT PRIMARY KEY,
            name       TEXT NOT NULL,
            emoji      TEXT NOT NULL DEFAULT '💻',
            color      TEXT NOT NULL DEFAULT '#e8a045',
            position   INTEGER NOT NULL,
            created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS terminals (
            id           TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            shell        TEXT NOT NULL DEFAULT 'zsh',
            cwd          TEXT NOT NULL,
            position     INTEGER NOT NULL,
            size_percent REAL NOT NULL DEFAULT 50,
            created_at   INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS scrollback (
            terminal_id TEXT NOT NULL REFERENCES terminals(id) ON DELETE CASCADE,
            line_index  INTEGER NOT NULL,
            data        TEXT NOT NULL,
            PRIMARY KEY (terminal_id, line_index)
        );",
    )?;
    Ok(conn)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn open_test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS workspaces (
                id TEXT PRIMARY KEY, name TEXT NOT NULL,
                emoji TEXT NOT NULL DEFAULT '💻', color TEXT NOT NULL DEFAULT '#e8a045',
                position INTEGER NOT NULL, created_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS terminals (
                id TEXT PRIMARY KEY,
                workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                shell TEXT NOT NULL DEFAULT 'zsh', cwd TEXT NOT NULL,
                position INTEGER NOT NULL, size_percent REAL NOT NULL DEFAULT 50,
                created_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS scrollback (
                terminal_id TEXT NOT NULL REFERENCES terminals(id) ON DELETE CASCADE,
                line_index INTEGER NOT NULL, data TEXT NOT NULL,
                PRIMARY KEY (terminal_id, line_index)
            );",
        )
        .unwrap();
        conn
    }

    #[test]
    fn test_init_creates_three_tables() {
        let conn = open_test_db();
        let count: i64 = conn
            .query_row(
                "SELECT count(*) FROM sqlite_master WHERE type='table'
                 AND name IN ('workspaces','terminals','scrollback')",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 3);
    }
}
