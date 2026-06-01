# Browser Pane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a native browser pane to termspace that lives as a peer pane in the split layout grid, supports all URLs via a Tauri v2 child webview overlay, and persists to SQLite with URL restoration on app restart.

**Architecture:** React renders a transparent placeholder div + HTML header bar. A Tauri v2 child webview (WKWebView on macOS) floats at the exact same pixel coordinates as the placeholder, visually filling it. `ResizeObserver` on the placeholder triggers `resize_browser_pane` Tauri commands to keep the native webview in sync. Workspace switches call `show_browser_pane` / `hide_browser_pane` to keep webviews alive without destroying them.

**Tech Stack:** Tauri v2, React 18, TypeScript, Zustand, rusqlite, react-resizable-panels, `@tauri-apps/api/event`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src-tauri/src/db.rs` | Modify | Add `BrowserPane` struct, `browser_panes` table, CRUD fns |
| `src-tauri/src/browser_pane_manager.rs` | **Create** | Owns `HashMap<id, Webview>`, all webview lifecycle ops |
| `src-tauri/src/commands.rs` | Modify | Add 9 browser pane Tauri commands |
| `src-tauri/src/lib.rs` | Modify | Register `BrowserPaneManager` state + new commands |
| `src/types/index.ts` | Modify | Add `BrowserPane` type, add `browser` variant to `LayoutNode` |
| `src/utils/layout.ts` | Modify | Add `addBrowserPaneToLayout`, `removeBrowserPaneFromLayout` |
| `src/store/useAppStore.ts` | Modify | Add `browserPanesByWorkspace`, `addBrowserPane`, `removeBrowserPane` |
| `src/components/WorkspaceView/BrowserPane.tsx` | **Create** | Header bar + transparent hole div, ResizeObserver, URL events |
| `src/components/WorkspaceView/TerminalGrid.tsx` | Modify | Render `BrowserPane` for `type: 'browser'` layout nodes |
| `src/components/WorkspaceView/WorkspaceView.tsx` | Modify | `handleAddBrowserPane`, `handleCloseBrowserPane` |
| `src/components/WorkspaceView/WorkspaceHeader.tsx` | Modify | `+ Browser` button |
| `src/App.tsx` | Modify | Restore browser panes on activate, show/hide on workspace switch |

---

## Task 1: DB — browser_panes table and CRUD

**Files:**
- Modify: `src-tauri/src/db.rs`

- [ ] **Step 1: Write the failing DB tests**

Add to the `#[cfg(test)]` block in `src-tauri/src/db.rs`:

```rust
fn open_test_db_with_browser() -> Connection {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS workspaces (
            id TEXT PRIMARY KEY, name TEXT NOT NULL,
            emoji TEXT NOT NULL DEFAULT '💻', color TEXT NOT NULL DEFAULT '#e8a045',
            position INTEGER NOT NULL, created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS browser_panes (
            id           TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            url          TEXT NOT NULL DEFAULT 'about:blank',
            position     INTEGER NOT NULL DEFAULT 0,
            created_at   INTEGER NOT NULL
        );",
    ).unwrap();
    conn
}

#[test]
fn test_browser_pane_crud() {
    let conn = open_test_db_with_browser();
    conn.execute(
        "INSERT INTO workspaces (id,name,emoji,color,position,created_at) VALUES (?1,?2,?3,?4,?5,?6)",
        params!["ws-1", "Work", "🔥", "#e8a045", 0i64, 1_000_000i64],
    ).unwrap();

    create_browser_pane(&conn, "bp-1", "ws-1", "http://localhost:3000").unwrap();

    let panes = get_browser_panes(&conn, "ws-1").unwrap();
    assert_eq!(panes.len(), 1);
    assert_eq!(panes[0].url, "http://localhost:3000");

    update_browser_pane_url(&conn, "bp-1", "http://localhost:3000/dashboard").unwrap();
    let panes2 = get_browser_panes(&conn, "ws-1").unwrap();
    assert_eq!(panes2[0].url, "http://localhost:3000/dashboard");

    delete_browser_pane(&conn, "bp-1").unwrap();
    let panes3 = get_browser_panes(&conn, "ws-1").unwrap();
    assert_eq!(panes3.len(), 0);
}

#[test]
fn test_browser_pane_cascade_delete() {
    let conn = open_test_db_with_browser();
    conn.execute(
        "INSERT INTO workspaces (id,name,emoji,color,position,created_at) VALUES (?1,?2,?3,?4,?5,?6)",
        params!["ws-1", "Work", "🔥", "#e8a045", 0i64, 1_000_000i64],
    ).unwrap();
    create_browser_pane(&conn, "bp-1", "ws-1", "http://localhost:3000").unwrap();
    conn.execute("DELETE FROM workspaces WHERE id=?1", params!["ws-1"]).unwrap();
    let count: i64 = conn.query_row(
        "SELECT count(*) FROM browser_panes", [], |r| r.get(0)
    ).unwrap();
    assert_eq!(count, 0);
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd src-tauri && cargo test test_browser_pane 2>&1 | tail -20
```
Expected: compile error — `create_browser_pane`, `get_browser_panes` etc. not found.

- [ ] **Step 3: Add BrowserPane struct and CRUD to db.rs**

Add after the `Terminal` struct definition:

```rust
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BrowserPane {
    pub id: String,
    pub workspace_id: String,
    pub url: String,
    pub position: i64,
    pub created_at: i64,
}
```

Add the `browser_panes` table to `init_db` — append to the existing `execute_batch` string:

```rust
// inside init_db, add to the execute_batch call:
"CREATE TABLE IF NOT EXISTS browser_panes (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    url          TEXT NOT NULL DEFAULT 'about:blank',
    position     INTEGER NOT NULL DEFAULT 0,
    created_at   INTEGER NOT NULL
);"
```

Add these functions after `load_scrollback`:

```rust
pub fn create_browser_pane(conn: &Connection, id: &str, workspace_id: &str, url: &str) -> Result<BrowserPane> {
    let position: i64 = conn.query_row(
        "SELECT COALESCE(MAX(position)+1,0) FROM browser_panes WHERE workspace_id=?1",
        params![workspace_id], |r| r.get(0),
    )?;
    let created_at = now_ms();
    conn.execute(
        "INSERT INTO browser_panes (id,workspace_id,url,position,created_at) VALUES (?1,?2,?3,?4,?5)",
        params![id, workspace_id, url, position, created_at],
    )?;
    Ok(BrowserPane { id: id.into(), workspace_id: workspace_id.into(), url: url.into(), position, created_at })
}

pub fn get_browser_panes(conn: &Connection, workspace_id: &str) -> Result<Vec<BrowserPane>> {
    let mut stmt = conn.prepare(
        "SELECT id,workspace_id,url,position,created_at FROM browser_panes WHERE workspace_id=?1 ORDER BY position",
    )?;
    let rows = stmt.query_map(params![workspace_id], |r| Ok(BrowserPane {
        id: r.get(0)?, workspace_id: r.get(1)?, url: r.get(2)?,
        position: r.get(3)?, created_at: r.get(4)?,
    }))?.collect();
    rows
}

pub fn update_browser_pane_url(conn: &Connection, id: &str, url: &str) -> Result<()> {
    conn.execute("UPDATE browser_panes SET url=?1 WHERE id=?2", params![url, id])?;
    Ok(())
}

pub fn delete_browser_pane(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM browser_panes WHERE id=?1", params![id])?;
    Ok(())
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd src-tauri && cargo test test_browser_pane 2>&1 | tail -10
```
Expected: `test test_browser_pane_crud ... ok` and `test test_browser_pane_cascade_delete ... ok`

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/db.rs
git commit -m "feat: add browser_panes table and CRUD to db"
```

---

## Task 2: Rust — BrowserPaneManager

**Files:**
- Create: `src-tauri/src/browser_pane_manager.rs`

- [ ] **Step 1: Create browser_pane_manager.rs**

```rust
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{WebviewBuilder, WebviewUrl, WebviewWindow};
use tauri::dpi::{LogicalPosition, LogicalSize};

struct PaneEntry {
    webview: tauri::Webview,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

pub struct BrowserPaneManager {
    panes: Mutex<HashMap<String, PaneEntry>>,
}

impl BrowserPaneManager {
    pub fn new() -> Self {
        Self { panes: Mutex::new(HashMap::new()) }
    }

    pub fn create(
        &self,
        window: &WebviewWindow,
        app: &tauri::AppHandle,
        id: &str,
        url: &str,
        x: f64, y: f64, w: f64, h: f64,
    ) -> Result<(), tauri::Error> {
        let app_handle = app.clone();
        let id_owned = id.to_string();

        let builder = WebviewBuilder::new(
            format!("browser-pane-{}", id),
            WebviewUrl::External(url.parse().unwrap_or_else(|_| "about:blank".parse().unwrap())),
        )
        .on_navigation(move |nav_url| {
            let _ = app_handle.emit("browser-pane-url-changed", serde_json::json!({
                "id": id_owned,
                "url": nav_url.to_string(),
            }));
            true
        });

        let webview = window.add_child(
            builder,
            LogicalPosition::new(x, y),
            LogicalSize::new(w, h),
        )?;

        self.panes.lock().unwrap().insert(id.to_string(), PaneEntry { webview, x, y, w, h });
        Ok(())
    }

    pub fn navigate(&self, id: &str, url: &str) {
        let panes = self.panes.lock().unwrap();
        if let Some(entry) = panes.get(id) {
            let _ = entry.webview.navigate(url.parse().unwrap());
        }
    }

    pub fn set_bounds(&self, id: &str, x: f64, y: f64, w: f64, h: f64) {
        let mut panes = self.panes.lock().unwrap();
        if let Some(entry) = panes.get_mut(id) {
            entry.x = x; entry.y = y; entry.w = w; entry.h = h;
            let _ = entry.webview.set_position(LogicalPosition::new(x, y));
            let _ = entry.webview.set_size(LogicalSize::new(w, h));
        }
    }

    pub fn go_back(&self, id: &str) {
        let panes = self.panes.lock().unwrap();
        if let Some(entry) = panes.get(id) {
            let _ = entry.webview.evaluate_script("history.back()");
        }
    }

    pub fn go_forward(&self, id: &str) {
        let panes = self.panes.lock().unwrap();
        if let Some(entry) = panes.get(id) {
            let _ = entry.webview.evaluate_script("history.forward()");
        }
    }

    pub fn reload(&self, id: &str) {
        let panes = self.panes.lock().unwrap();
        if let Some(entry) = panes.get(id) {
            let _ = entry.webview.evaluate_script("location.reload()");
        }
    }

    pub fn hide(&self, id: &str) {
        let panes = self.panes.lock().unwrap();
        if let Some(entry) = panes.get(id) {
            let _ = entry.webview.set_position(LogicalPosition::new(-10000.0_f64, -10000.0_f64));
            let _ = entry.webview.set_size(LogicalSize::new(1.0_f64, 1.0_f64));
        }
    }

    pub fn show(&self, id: &str) {
        let panes = self.panes.lock().unwrap();
        if let Some(entry) = panes.get(id) {
            let _ = entry.webview.set_position(LogicalPosition::new(entry.x, entry.y));
            let _ = entry.webview.set_size(LogicalSize::new(entry.w, entry.h));
        }
    }

    pub fn destroy(&self, id: &str) {
        let mut panes = self.panes.lock().unwrap();
        if let Some(entry) = panes.remove(id) {
            let _ = entry.webview.close();
        }
    }
}
```

> **Note:** Verify exact method names against Tauri v2 docs: `Webview::set_position`, `Webview::set_size`, `Webview::navigate`, `Webview::evaluate_script`, `Webview::close`, `WebviewWindow::add_child`. Run `cargo doc --open` in `src-tauri/` to browse them.

- [ ] **Step 2: Verify it compiles (no tests yet — tested through commands in Task 3)**

```bash
cd src-tauri && cargo check 2>&1 | grep -E "^error" | head -20
```
Expected: 0 errors (warnings about unused code are fine since commands haven't been wired yet).

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/browser_pane_manager.rs
git commit -m "feat: add BrowserPaneManager with child webview lifecycle"
```

---

## Task 3: Rust — Commands and lib.rs registration

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add BrowserPaneManager import and commands to commands.rs**

Add at the top of `commands.rs` with existing imports:

```rust
use crate::browser_pane_manager::BrowserPaneManager;
```

Add these commands after the existing `save_scrollback` command:

```rust
#[tauri::command]
pub fn create_browser_pane(
    db: State<DbState>,
    browser: State<BrowserPaneManager>,
    app: tauri::AppHandle,
    workspace_id: String,
    url: String,
    x: f64, y: f64, w: f64, h: f64,
) -> Result<db::BrowserPane, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let window = app.get_webview_window("main").ok_or("no main window")?;
    browser.create(&window, &app, &id, &url, x, y, w, h)
        .map_err(|e| e.to_string())?;
    db::create_browser_pane(&db.0.lock().unwrap(), &id, &workspace_id, &url)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn respawn_browser_pane(
    browser: State<BrowserPaneManager>,
    app: tauri::AppHandle,
    id: String,
    url: String,
    x: f64, y: f64, w: f64, h: f64,
) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("no main window")?;
    browser.create(&window, &app, &id, &url, x, y, w, h)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn navigate_browser_pane(
    db: State<DbState>,
    browser: State<BrowserPaneManager>,
    id: String,
    url: String,
) -> Result<(), String> {
    browser.navigate(&id, &url);
    db::update_browser_pane_url(&db.0.lock().unwrap(), &id, &url)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_browser_pane_url(
    db: State<DbState>,
    id: String,
    url: String,
) -> Result<(), String> {
    db::update_browser_pane_url(&db.0.lock().unwrap(), &id, &url)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn resize_browser_pane(
    browser: State<BrowserPaneManager>,
    id: String,
    x: f64, y: f64, w: f64, h: f64,
) -> Result<(), String> {
    browser.set_bounds(&id, x, y, w, h);
    Ok(())
}

#[tauri::command]
pub fn show_browser_pane(browser: State<BrowserPaneManager>, id: String) -> Result<(), String> {
    browser.show(&id);
    Ok(())
}

#[tauri::command]
pub fn hide_browser_pane(browser: State<BrowserPaneManager>, id: String) -> Result<(), String> {
    browser.hide(&id);
    Ok(())
}

#[tauri::command]
pub fn destroy_browser_pane(
    db: State<DbState>,
    browser: State<BrowserPaneManager>,
    id: String,
) -> Result<(), String> {
    browser.destroy(&id);
    db::delete_browser_pane(&db.0.lock().unwrap(), &id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn browser_go_back(browser: State<BrowserPaneManager>, id: String) -> Result<(), String> {
    browser.go_back(&id);
    Ok(())
}

#[tauri::command]
pub fn browser_go_forward(browser: State<BrowserPaneManager>, id: String) -> Result<(), String> {
    browser.go_forward(&id);
    Ok(())
}

#[tauri::command]
pub fn browser_reload(browser: State<BrowserPaneManager>, id: String) -> Result<(), String> {
    browser.reload(&id);
    Ok(())
}

#[tauri::command]
pub fn get_browser_panes(
    db: State<DbState>,
    workspace_id: String,
) -> Result<Vec<db::BrowserPane>, String> {
    db::get_browser_panes(&db.0.lock().unwrap(), &workspace_id)
        .map_err(|e| e.to_string())
}
```

- [ ] **Step 2: Register module + state + commands in lib.rs**

Replace `src-tauri/src/lib.rs` entirely:

```rust
mod browser_pane_manager;
mod commands;
mod db;
mod pty_manager;

use browser_pane_manager::BrowserPaneManager;
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
            app.manage(BrowserPaneManager::new());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_workspaces,
            commands::create_workspace,
            commands::update_workspace,
            commands::delete_workspace,
            commands::get_terminals,
            commands::spawn_terminal,
            commands::respawn_terminal,
            commands::start_terminal,
            commands::close_terminal,
            commands::write_pty,
            commands::resize_pty,
            commands::load_scrollback,
            commands::save_scrollback,
            commands::create_browser_pane,
            commands::respawn_browser_pane,
            commands::navigate_browser_pane,
            commands::save_browser_pane_url,
            commands::resize_browser_pane,
            commands::show_browser_pane,
            commands::hide_browser_pane,
            commands::destroy_browser_pane,
            commands::browser_go_back,
            commands::browser_go_forward,
            commands::browser_reload,
            commands::get_browser_panes,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 3: Verify full compile**

```bash
cd src-tauri && cargo check 2>&1 | grep -E "^error" | head -20
```
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat: add browser pane Tauri commands and register state"
```

---

## Task 4: Frontend — types and layout utils

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/utils/layout.ts`

- [ ] **Step 1: Write failing layout tests**

Add to `src/utils/layout.test.ts` (create this file):

```ts
import { describe, it, expect } from 'vitest'
import {
  addBrowserPaneToLayout,
  removeBrowserPaneFromLayout,
} from './layout'
import { LayoutNode } from '../types'

describe('addBrowserPaneToLayout', () => {
  it('creates a single browser node when root is null', () => {
    const result = addBrowserPaneToLayout(null, 'bp-1')
    expect(result).toEqual({ type: 'browser', id: expect.any(String), browserPaneId: 'bp-1' })
  })

  it('splits an existing pane node with a browser node', () => {
    const root: LayoutNode = { type: 'pane', id: 'p1', terminalId: 't-1' }
    const result = addBrowserPaneToLayout(root, 'bp-1', 't-1', 'horizontal')
    expect(result.type).toBe('split')
    if (result.type === 'split') {
      expect(result.children[1]).toEqual({ type: 'browser', id: expect.any(String), browserPaneId: 'bp-1' })
    }
  })
})

describe('removeBrowserPaneFromLayout', () => {
  it('returns null when removing the only browser pane', () => {
    const root: LayoutNode = { type: 'browser', id: 'n1', browserPaneId: 'bp-1' }
    expect(removeBrowserPaneFromLayout(root, 'bp-1')).toBeNull()
  })

  it('collapses split when browser pane is removed', () => {
    const root: LayoutNode = {
      type: 'split', id: 's1', direction: 'horizontal', sizes: [50, 50],
      children: [
        { type: 'pane', id: 'p1', terminalId: 't-1' },
        { type: 'browser', id: 'b1', browserPaneId: 'bp-1' },
      ]
    }
    const result = removeBrowserPaneFromLayout(root, 'bp-1')
    expect(result).toEqual({ type: 'pane', id: 'p1', terminalId: 't-1' })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/utils/layout.test.ts 2>&1 | tail -15
```
Expected: import errors — `addBrowserPaneToLayout` not found.

- [ ] **Step 3: Update types/index.ts**

Replace the `LayoutNode` type and add `BrowserPane`:

```ts
export interface Workspace {
  id: string
  name: string
  emoji: string
  color: string
  position: number
  createdAt: number
}

export interface Terminal {
  id: string
  workspaceId: string
  shell: string
  cwd: string
  position: number
  sizePercent: number
  createdAt: number
  scrollback?: string[]
}

export interface BrowserPane {
  id: string
  workspaceId: string
  url: string
  position: number
  createdAt: number
}

export type LayoutDirection = 'horizontal' | 'vertical'

export type LayoutNode =
  | { type: 'pane';    id: string; terminalId: string }
  | { type: 'browser'; id: string; browserPaneId: string }
  | { type: 'split';   id: string; direction: LayoutDirection; sizes: number[]; children: LayoutNode[] }
```

- [ ] **Step 4: Add browser pane functions to layout.ts**

Add after `updateSplitSizes`:

```ts
export function addBrowserPaneToLayout(
  root: LayoutNode | null,
  browserPaneId: string,
  targetId?: string,
  direction: LayoutDirection = 'horizontal'
): LayoutNode {
  const newNode: LayoutNode = { type: 'browser', id: generateId(), browserPaneId }

  if (!root) return newNode

  if (!targetId) {
    return { type: 'split', id: generateId(), direction, sizes: [50, 50], children: [root, newNode] }
  }

  function traverseAndAdd(node: LayoutNode): LayoutNode {
    if (node.type === 'pane') {
      if (node.terminalId === targetId) {
        return { type: 'split', id: generateId(), direction, sizes: [50, 50], children: [node, newNode] }
      }
      return node
    }
    if (node.type === 'browser') {
      if (node.browserPaneId === targetId) {
        return { type: 'split', id: generateId(), direction, sizes: [50, 50], children: [node, newNode] }
      }
      return node
    }
    if (node.type === 'split') {
      return { ...node, children: node.children.map(traverseAndAdd) }
    }
    return node
  }

  return traverseAndAdd(root)
}

export function removeBrowserPaneFromLayout(root: LayoutNode | null, browserPaneId: string): LayoutNode | null {
  if (!root) return null

  function traverseAndRemove(node: LayoutNode): LayoutNode | null {
    if (node.type === 'browser') {
      return node.browserPaneId === browserPaneId ? null : node
    }
    if (node.type === 'pane') return node
    if (node.type === 'split') {
      const newChildren = node.children.map(traverseAndRemove).filter(Boolean) as LayoutNode[]
      if (newChildren.length === 0) return null
      if (newChildren.length === 1) return newChildren[0]
      return { ...node, children: newChildren }
    }
    return node
  }

  return traverseAndRemove(root)
}
```

Also update `addTerminalToLayout` to traverse `browser` nodes (currently it silently skips them). Find `traverseAndAdd` inside `addTerminalToLayout` and add the browser case:

```ts
// Inside addTerminalToLayout's traverseAndAdd function, add after the 'pane' block:
if (node.type === 'browser') {
  if (node.browserPaneId === targetId) {
    return { type: 'split', id: generateId(), direction, sizes: [50, 50], children: [node, newPane] }
  }
  return node
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run src/utils/layout.test.ts 2>&1 | tail -10
```
Expected: all 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/utils/layout.ts src/utils/layout.test.ts
git commit -m "feat: add BrowserPane type and layout utils for browser nodes"
```

---

## Task 5: Store — browser pane state

**Files:**
- Modify: `src/store/useAppStore.ts`

- [ ] **Step 1: Write failing store tests**

Add to `src/store/useAppStore.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore } from './useAppStore'
import { BrowserPane } from '../types'

describe('browser pane store', () => {
  beforeEach(() => {
    useAppStore.setState({
      browserPanesByWorkspace: {},
      layoutsByWorkspace: {},
    })
  })

  it('addBrowserPane adds pane and creates browser layout node', () => {
    const pane: BrowserPane = {
      id: 'bp-1', workspaceId: 'ws-1', url: 'http://localhost:3000',
      position: 0, createdAt: 1000,
    }
    useAppStore.getState().addBrowserPane('ws-1', pane)
    const panes = useAppStore.getState().browserPanesByWorkspace['ws-1']
    expect(panes).toHaveLength(1)
    expect(panes[0].id).toBe('bp-1')

    const layout = useAppStore.getState().layoutsByWorkspace['ws-1']
    expect(layout?.type).toBe('browser')
  })

  it('removeBrowserPane removes pane from store and layout', () => {
    const pane: BrowserPane = {
      id: 'bp-1', workspaceId: 'ws-1', url: 'http://localhost:3000',
      position: 0, createdAt: 1000,
    }
    useAppStore.getState().addBrowserPane('ws-1', pane)
    useAppStore.getState().removeBrowserPane('ws-1', 'bp-1')
    const panes = useAppStore.getState().browserPanesByWorkspace['ws-1']
    expect(panes).toHaveLength(0)
    expect(useAppStore.getState().layoutsByWorkspace['ws-1']).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run src/store/useAppStore.test.ts 2>&1 | tail -15
```
Expected: errors — `browserPanesByWorkspace`, `addBrowserPane`, `removeBrowserPane` not on store.

- [ ] **Step 3: Update useAppStore.ts**

Add `BrowserPane` to imports at top:

```ts
import { Workspace, Terminal, BrowserPane, LayoutNode, LayoutDirection } from '../types'
import { addTerminalToLayout, removeTerminalFromLayout, swapTerminalsInLayout, updateSplitSizes, addBrowserPaneToLayout, removeBrowserPaneFromLayout } from '../utils/layout'
```

Add to the `AppState` interface (after `terminalsByWorkspace`):

```ts
browserPanesByWorkspace: Record<string, BrowserPane[]>
setBrowserPanes: (workspaceId: string, panes: BrowserPane[]) => void
addBrowserPane: (workspaceId: string, pane: BrowserPane, targetId?: string, direction?: LayoutDirection) => void
removeBrowserPane: (workspaceId: string, browserPaneId: string) => void
```

Add to the Zustand initial state (after `terminalsByWorkspace: {}`):

```ts
browserPanesByWorkspace: {},
```

Add these action implementations (after `removeTerminal`):

```ts
setBrowserPanes: (workspaceId, panes) =>
  set((s) => {
    let layout = s.layoutsByWorkspace[workspaceId] ?? null
    if (panes.length === 0) {
      // Remove all browser nodes from existing layout rather than wiping the whole layout
      // (terminals may still be in it)
    } else {
      // Only add browser nodes not already in the layout
      const existingBrowserIds = new Set<string>()
      const collectBrowserIds = (node: LayoutNode | null) => {
        if (!node) return
        if (node.type === 'browser') existingBrowserIds.add(node.browserPaneId)
        if (node.type === 'split') node.children.forEach(collectBrowserIds)
      }
      collectBrowserIds(layout)
      for (const pane of panes) {
        if (!existingBrowserIds.has(pane.id)) {
          layout = addBrowserPaneToLayout(layout, pane.id)
        }
      }
    }
    return {
      browserPanesByWorkspace: { ...s.browserPanesByWorkspace, [workspaceId]: panes },
      layoutsByWorkspace: { ...s.layoutsByWorkspace, [workspaceId]: layout },
    }
  }),

addBrowserPane: (workspaceId, pane, targetId, direction) =>
  set((s) => {
    const layout = s.layoutsByWorkspace[workspaceId] ?? null
    return {
      browserPanesByWorkspace: {
        ...s.browserPanesByWorkspace,
        [workspaceId]: [...(s.browserPanesByWorkspace[workspaceId] ?? []), pane],
      },
      layoutsByWorkspace: {
        ...s.layoutsByWorkspace,
        [workspaceId]: addBrowserPaneToLayout(layout, pane.id, targetId, direction),
      },
    }
  }),

removeBrowserPane: (workspaceId, browserPaneId) =>
  set((s) => {
    const layout = s.layoutsByWorkspace[workspaceId] ?? null
    return {
      browserPanesByWorkspace: {
        ...s.browserPanesByWorkspace,
        [workspaceId]: (s.browserPanesByWorkspace[workspaceId] ?? []).filter(
          (p) => p.id !== browserPaneId,
        ),
      },
      layoutsByWorkspace: {
        ...s.layoutsByWorkspace,
        [workspaceId]: removeBrowserPaneFromLayout(layout, browserPaneId),
      },
    }
  }),
```

Also update the `setTerminals` ghost-layout cleanup to handle `browser` nodes — find the `cleanLayout` function inside `setTerminals` and update it:

```ts
const cleanLayout = (node: LayoutNode | null): LayoutNode | null => {
  if (!node) return null
  if (node.type === 'pane') {
    return validIds.has(node.terminalId) ? node : null
  }
  if (node.type === 'browser') {
    // browser pane IDs are cleaned separately when browser panes load
    return node
  }
  if (node.type === 'split') {
    const newChildren = node.children.map(cleanLayout).filter(Boolean) as LayoutNode[]
    if (newChildren.length === 0) return null
    if (newChildren.length === 1) return newChildren[0]
    return { ...node, children: newChildren }
  }
  return node
}
```

- [ ] **Step 4: Run store tests**

```bash
npx vitest run src/store/useAppStore.test.ts 2>&1 | tail -10
```
Expected: all browser pane tests pass (existing terminal tests must still pass too).

- [ ] **Step 5: Commit**

```bash
git add src/store/useAppStore.ts src/store/useAppStore.test.ts
git commit -m "feat: add browser pane state to Zustand store"
```

---

## Task 6: BrowserPane React component

**Files:**
- Create: `src/components/WorkspaceView/BrowserPane.tsx`

- [ ] **Step 1: Create BrowserPane.tsx**

```tsx
import { useEffect, useRef, useState, useLayoutEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '../../utils/tauri'

interface Props {
  browserPaneId: string
  initialUrl: string
  isActive: boolean
  isMaximized: boolean
  onFocus: () => void
  onClose: () => void
  onSplit: (direction: 'horizontal' | 'vertical') => void
  onToggleMaximize: () => void
}

export function BrowserPane({
  browserPaneId, initialUrl, isActive, isMaximized,
  onFocus, onClose, onSplit, onToggleMaximize,
}: Props) {
  const [url, setUrl] = useState(initialUrl)
  const [inputUrl, setInputUrl] = useState(initialUrl)
  const [isEditingUrl, setIsEditingUrl] = useState(false)
  const holeRef = useRef<HTMLDivElement>(null)

  // Sync native webview position whenever the hole div's bounds change
  const syncBounds = () => {
    if (!holeRef.current) return
    const rect = holeRef.current.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) return
    invoke('resize_browser_pane', {
      id: browserPaneId,
      x: rect.left,
      y: rect.top,
      w: rect.width,
      h: rect.height,
    }).catch(() => {}) // non-fatal, next resize will retry
  }

  // ResizeObserver — fires on drag-handle resize
  useLayoutEffect(() => {
    const el = holeRef.current
    if (!el) return
    const ro = new ResizeObserver(syncBounds)
    ro.observe(el)
    syncBounds() // initial sync
    return () => ro.disconnect()
  }, [browserPaneId])

  // Window resize
  useEffect(() => {
    window.addEventListener('resize', syncBounds)
    return () => window.removeEventListener('resize', syncBounds)
  }, [browserPaneId])

  // Listen for URL change events from native webview
  useEffect(() => {
    const unlisten = listen<{ id: string; url: string }>('browser-pane-url-changed', (event) => {
      if (event.payload.id !== browserPaneId) return
      const newUrl = event.payload.url
      setUrl(newUrl)
      setInputUrl(newUrl)
      invoke('save_browser_pane_url', { id: browserPaneId, url: newUrl }).catch(() => {})
    })
    return () => { unlisten.then(fn => fn()) }
  }, [browserPaneId])

  // Hide native webview on unmount (workspace switch) — not destroy
  useEffect(() => {
    return () => {
      invoke('hide_browser_pane', { id: browserPaneId }).catch(() => {})
    }
  }, [browserPaneId])

  const handleNavigate = (target: string) => {
    const normalized = target.startsWith('http') ? target : `https://${target}`
    setUrl(normalized)
    setInputUrl(normalized)
    setIsEditingUrl(false)
    invoke('navigate_browser_pane', { id: browserPaneId, url: normalized }).catch(() => {})
  }

  const borderColor = isActive ? 'var(--accent, #4a7aff)' : 'var(--border-inactive, #333)'

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', minWidth: 0, minHeight: 0 }}
      onClick={onFocus}
    >
      {/* Header bar — real React HTML */}
      <div style={{
        height: 36, display: 'flex', alignItems: 'center', padding: '0 8px', gap: 6,
        background: 'var(--bg-panel, #1e1e1e)', borderBottom: `1px solid ${borderColor}`,
        flexShrink: 0,
      }}>
        {/* Back */}
        <button
          onClick={(e) => { e.stopPropagation(); invoke('browser_go_back', { id: browserPaneId }) }}
          style={btnStyle}
          title="Back"
        >←</button>
        {/* Forward */}
        <button
          onClick={(e) => { e.stopPropagation(); invoke('browser_go_forward', { id: browserPaneId }) }}
          style={btnStyle}
          title="Forward"
        >→</button>
        {/* Reload */}
        <button
          onClick={(e) => { e.stopPropagation(); invoke('browser_reload', { id: browserPaneId }) }}
          style={btnStyle}
          title="Reload"
        >↺</button>

        {/* URL bar */}
        {isEditingUrl ? (
          <input
            autoFocus
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleNavigate(inputUrl)
              if (e.key === 'Escape') { setIsEditingUrl(false); setInputUrl(url) }
            }}
            onBlur={() => { setIsEditingUrl(false); setInputUrl(url) }}
            style={{
              flex: 1, height: 22, background: '#2a2a2a', border: '1px solid #4a7aff',
              borderRadius: 4, color: '#ccc', fontSize: 11, fontFamily: 'monospace',
              padding: '0 8px', outline: 'none',
            }}
          />
        ) : (
          <div
            onClick={(e) => { e.stopPropagation(); setIsEditingUrl(true) }}
            style={{
              flex: 1, height: 22, background: '#2a2a2a', border: '1px solid #333',
              borderRadius: 4, display: 'flex', alignItems: 'center', padding: '0 8px',
              gap: 4, cursor: 'text',
            }}
          >
            <span style={{ fontSize: 10, color: '#888' }}>🌐</span>
            <span style={{ fontSize: 11, color: '#bbb', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {url || 'about:blank'}
            </span>
          </div>
        )}

        {/* Action buttons */}
        <button onClick={(e) => { e.stopPropagation(); onSplit('horizontal') }} style={btnStyle} title="Split right">⊟</button>
        <button onClick={(e) => { e.stopPropagation(); onSplit('vertical') }} style={btnStyle} title="Split down">⊞</button>
        <button onClick={(e) => { e.stopPropagation(); onToggleMaximize() }} style={btnStyle} title="Maximize">⤢</button>
        <button onClick={(e) => { e.stopPropagation(); onClose() }} style={{ ...btnStyle, color: '#e06c75' }} title="Close">✕</button>
      </div>

      {/* Transparent hole — native webview floats here */}
      <div
        ref={holeRef}
        style={{ flex: 1, minHeight: 0, minWidth: 0, background: 'transparent' }}
      />
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  width: 22, height: 22, background: 'transparent', border: '1px solid #333',
  borderRadius: 4, color: '#999', fontSize: 12, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/WorkspaceView/BrowserPane.tsx
git commit -m "feat: add BrowserPane component with overlay sync and URL bar"
```

---

## Task 7: Wire BrowserPane into TerminalGrid

**Files:**
- Modify: `src/components/WorkspaceView/TerminalGrid.tsx`

- [ ] **Step 1: Add browser pane rendering to TerminalGrid**

Add import at the top:

```tsx
import { BrowserPane } from './BrowserPane'
import { useAppStore } from '../../store/useAppStore'
```

Update the `Props` interface to include browser pane handlers:

```tsx
interface Props {
  workspaceId: string
  terminals: TerminalType[]
  activeTerminalId: string | null
  onFocus: (terminalId: string) => void
  onClose: (terminalId: string) => void
  onSplit: (terminalId: string, direction: 'horizontal' | 'vertical') => void
  onCloseBrowserPane: (browserPaneId: string) => void
  onSplitBrowserPane: (browserPaneId: string, direction: 'horizontal' | 'vertical') => void
}
```

Add `onCloseBrowserPane` and `onSplitBrowserPane` to the function signature. Then add a `renderBrowserPane` helper after `renderTerminal`:

```tsx
const browserPanes = useAppStore((s) => s.browserPanesByWorkspace[workspaceId] ?? [])

const renderBrowserPane = (browserPaneId: string) => {
  const pane = browserPanes.find(p => p.id === browserPaneId)
  if (!pane) return null
  return (
    <div
      key={pane.id}
      style={{ display: 'flex', width: '100%', height: '100%', minWidth: 0, minHeight: 0 }}
    >
      <BrowserPane
        browserPaneId={pane.id}
        initialUrl={pane.url}
        isActive={pane.id === activeTerminalId}
        isMaximized={maximizedTerminalId === pane.id}
        onFocus={() => onFocus(pane.id)}
        onClose={() => {
          if (maximizedTerminalId === pane.id) setMaximizedTerminalId(null)
          onCloseBrowserPane(pane.id)
        }}
        onSplit={(direction) => onSplitBrowserPane(pane.id, direction)}
        onToggleMaximize={() => setMaximizedTerminalId(maximizedTerminalId === pane.id ? null : pane.id)}
      />
    </div>
  )
}
```

Update `renderLayoutNode` to handle `type: 'browser'`:

```tsx
const renderLayoutNode = (node: LayoutNode): React.ReactNode => {
  if (node.type === 'pane') {
    return renderTerminal(node.terminalId)
  }
  if (node.type === 'browser') {
    return renderBrowserPane(node.browserPaneId)
  }
  if (node.type === 'split') {
    // ... existing split rendering unchanged
  }
  return null
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: errors about `onCloseBrowserPane` / `onSplitBrowserPane` not passed at call sites — this is expected and will be fixed in Task 8.

- [ ] **Step 3: Commit**

```bash
git add src/components/WorkspaceView/TerminalGrid.tsx
git commit -m "feat: render browser pane nodes in TerminalGrid layout"
```

---

## Task 8: WorkspaceView + WorkspaceHeader

**Files:**
- Modify: `src/components/WorkspaceView/WorkspaceView.tsx`
- Modify: `src/components/WorkspaceView/WorkspaceHeader.tsx`

- [ ] **Step 1: Update WorkspaceView.tsx**

Add imports:

```tsx
import { BrowserPane as BrowserPaneType } from '../../types'
import { invoke } from '../../utils/tauri'
```

Add a stable empty array constant after `EMPTY_TERMINALS`:

```tsx
const EMPTY_BROWSER_PANES: BrowserPaneType[] = []
```

Add store selectors (after `removeTerminal`):

```tsx
const browserPanes = useAppStore((s) => s.browserPanesByWorkspace[workspace.id] ?? EMPTY_BROWSER_PANES)
const addBrowserPane = useAppStore((s) => s.addBrowserPane)
const removeBrowserPane = useAppStore((s) => s.removeBrowserPane)
```

Add `handleAddBrowserPane` and `handleCloseBrowserPane` (after `handleCloseTerminal`):

```tsx
const handleAddBrowserPane = async (targetId?: string, direction?: 'horizontal' | 'vertical') => {
  // Initial bounds — placed offscreen until ResizeObserver fires after mount
  try {
    const pane = await invoke<BrowserPaneType>('create_browser_pane', {
      workspaceId: workspace.id,
      url: 'about:blank',
      x: -10000, y: -10000, w: 800, h: 600,
    })
    addBrowserPane(workspace.id, pane, targetId, direction)
    setActiveTerminalId(pane.id)
    useAppStore.getState().addToast('Browser pane created', 'info')
  } catch (err) {
    console.error('create_browser_pane failed:', err)
    useAppStore.getState().addToast('Failed to create browser pane', 'error')
  }
}

const handleCloseBrowserPane = async (browserPaneId: string) => {
  try {
    await invoke('destroy_browser_pane', { id: browserPaneId })
  } catch (err) {
    console.error('destroy_browser_pane failed:', err)
  }
  removeBrowserPane(workspace.id, browserPaneId)
  useAppStore.getState().addToast('Browser pane closed', 'info')
  if (activeTerminalId === browserPaneId) {
    const remaining = [...terminals, ...browserPanes].filter(p => p.id !== browserPaneId)
    setActiveTerminalId(remaining.length > 0 ? remaining[remaining.length - 1].id : null)
  }
}
```

Update the `TerminalGrid` JSX to pass new props:

```tsx
<TerminalGrid
  workspaceId={workspace.id}
  terminals={terminals}
  activeTerminalId={activeTerminalId}
  onFocus={setActiveTerminalId}
  onClose={handleCloseTerminal}
  onSplit={(terminalId, direction) => handleAddTerminal(terminalId, direction)}
  onCloseBrowserPane={handleCloseBrowserPane}
  onSplitBrowserPane={(browserPaneId, direction) => handleAddBrowserPane(browserPaneId, direction)}
/>
```

- [ ] **Step 2: Update WorkspaceHeader.tsx**

Update `Props`:

```tsx
interface Props {
  workspace: Workspace
  terminals: Terminal[]
  onAddTerminal: () => void
  onAddBrowserPane: () => void
  onEditWorkspace: () => void
}
```

Add `onAddBrowserPane` to function signature. Add the button after the terminal count span:

```tsx
<button
  onClick={onAddBrowserPane}
  style={{
    padding: '6px 14px', background: 'transparent',
    border: '1px dashed var(--border-inactive)', borderRadius: 6,
    color: 'var(--text-inactive)', fontSize: 12, fontWeight: 500, cursor: 'pointer',
    transition: 'all 0.2s ease', display: 'flex', alignItems: 'center', gap: 6
  }}
  onMouseEnter={(e) => {
    e.currentTarget.style.color = 'var(--text-active)'
    e.currentTarget.style.borderColor = 'var(--text-inactive)'
    e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
  }}
  onMouseLeave={(e) => {
    e.currentTarget.style.color = 'var(--text-inactive)'
    e.currentTarget.style.borderColor = 'var(--border-inactive)'
    e.currentTarget.style.background = 'transparent'
  }}
>
  <span style={{ fontSize: 14 }}>🌐</span> Browser
</button>
```

Update the `WorkspaceHeader` call site in `WorkspaceView.tsx`:

```tsx
<WorkspaceHeader
  workspace={workspace}
  terminals={terminals}
  onAddTerminal={() => handleAddTerminal()}
  onAddBrowserPane={() => handleAddBrowserPane()}
  onEditWorkspace={() => onEditWorkspace(workspace)}
/>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/WorkspaceView/WorkspaceView.tsx src/components/WorkspaceView/WorkspaceHeader.tsx
git commit -m "feat: add browser pane create/close in WorkspaceView and header button"
```

---

## Task 9: App.tsx — restore and show/hide on workspace switch

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add browser pane restore to activateWorkspace**

Add `BrowserPane` to the imports in `App.tsx` and destructure `setBrowserPanes` from the store alongside the existing store calls:

```tsx
import { BrowserPane } from './types'
// in the component, add alongside addTerminal / setTerminals:
const setBrowserPanes = useAppStore((s) => s.setBrowserPanes)
```

Find `activateWorkspace` and add browser pane loading **after** the `setTerminals(workspaceId, spawned)` call (and after the early-return `spawnAndAddTerminal` path — add it in both branches):

```tsx
// Load and restore browser panes for this workspace
const savedBrowserPanes = await withTimeout(
  invoke<BrowserPane[]>('get_browser_panes', { workspaceId }),
  5000, 'get_browser_panes'
).catch(() => [] as BrowserPane[])  // non-fatal — continue without browser panes

const restoredBrowserPanes: BrowserPane[] = []
for (const bp of savedBrowserPanes) {
  try {
    await withTimeout(
      invoke('respawn_browser_pane', { id: bp.id, url: bp.url, x: -10000, y: -10000, w: 800, h: 600 }),
      5000, 'respawn_browser_pane'
    )
    restoredBrowserPanes.push(bp)
  } catch (err) {
    console.warn('Failed to restore browser pane, skipping:', bp.id, err)
  }
}
setBrowserPanes(workspaceId, restoredBrowserPanes)
```

- [ ] **Step 2: Show/hide browser panes on workspace switch**

Find the `useEffect` that calls `activateWorkspace` when `activeWorkspaceId` changes, and add hide/show logic. Before calling `activateWorkspace(activeWorkspaceId)`, hide all browser panes of the previously active workspace:

```tsx
// Before activating new workspace, hide browser panes of old workspace
const prevWorkspaceId = prevActiveWorkspaceIdRef.current
if (prevWorkspaceId) {
  const prevPanes = useAppStore.getState().browserPanesByWorkspace[prevWorkspaceId] ?? []
  for (const pane of prevPanes) {
    invoke('hide_browser_pane', { id: pane.id }).catch(() => {})
  }
}
prevActiveWorkspaceIdRef.current = activeWorkspaceId
```

Add `prevActiveWorkspaceIdRef` above the effect:

```tsx
const prevActiveWorkspaceIdRef = useRef<string | null>(null)
```

After `activateWorkspace` completes, show browser panes for the newly active workspace (the `BrowserPane` component's `useLayoutEffect` will call `resize_browser_pane` which effectively shows them at the correct position). No extra `show_browser_pane` call needed here since `respawn_browser_pane` starts them at `(-10000, -10000)` and `BrowserPane`'s `ResizeObserver` will sync them to the correct position on mount.

- [ ] **Step 3: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: 0 errors.

- [ ] **Step 4: Run all tests**

```bash
npx vitest run 2>&1 | tail -20
```
Expected: all existing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat: restore browser panes on workspace activate and hide on switch"
```

---

## Final: End-to-end smoke test

After `npm run tauri dev` starts:

- [ ] Click `+ Browser` in the workspace header — a browser pane appears in the grid
- [ ] Type `http://localhost:1420` in the URL bar and press Enter — the page loads inside the pane
- [ ] Drag the resize handle between terminal and browser pane — both resize correctly
- [ ] Click the split button in the browser pane — a new terminal appears alongside it
- [ ] Switch to a different workspace — browser pane disappears; switch back — it reappears
- [ ] Restart the app — browser pane is restored with its last URL
- [ ] Close the browser pane with ✕ — it's removed from the layout

```bash
git tag browser-pane-v1
```
