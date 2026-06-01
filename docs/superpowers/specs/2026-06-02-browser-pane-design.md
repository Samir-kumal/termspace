# Browser Pane Feature — Design Spec

**Date:** 2026-06-02
**Status:** Approved

## Summary

Add a native browser pane to termspace that lives as a peer pane in the existing terminal grid layout. Users can split a browser pane alongside any terminal, resize it freely with drag handles, navigate to any URL (localhost or external), and have browser panes persist across app restarts.

---

## Requirements

- Browser pane is a first-class peer in the split layout grid (same as terminals)
- Supports all URLs — localhost dev servers and external sites
- Full navigation bar: back, forward, refresh, editable URL bar, split buttons, maximize, close
- Browser panes saved to SQLite and restored on next app launch with their last URL
- Resizable via existing drag handles

---

## Architecture

### The overlay trick

The React `BrowserPane` component renders two things:
1. A **header bar** (real React HTML) — URL bar, back/forward/refresh, action buttons
2. A **transparent hole div** — a `<div>` with no background that occupies the content area

A native Tauri child webview (`WKWebView` on macOS) floats at the exact same pixel coordinates as the hole div, visually filling it. The webview is not part of the React DOM — it is a separate OS-level view managed by Rust.

### Coordinate sync

```
hole div → getBoundingClientRect() → logical pixels
  → invoke('resize_browser_pane', { id, x, y, width, height })
  → Rust: webview.set_bounds(LogicalRect { x, y, width, height })
```

Three events trigger a re-sync:
1. `ResizeObserver` on the hole div (drag handle resize)
2. `window` resize event (app window resized by user)
3. Workspace switch (panes shown/hidden)

### URL change propagation

The native webview fires a Tauri event (`browser-pane-url-changed`) when the URL changes due to navigation or redirects. React listens and updates the URL bar display + calls `save_browser_pane_url` to persist to SQLite.

### Workspace switching

Browser panes are kept alive across workspace switches (not destroyed). On switch:
- Active workspace panes: `show_browser_pane(id)` + re-sync bounds
- Inactive workspace panes: `hide_browser_pane(id)`

---

## Data Model

### New type: `BrowserPane`

```ts
// src/types/index.ts
export interface BrowserPane {
  id: string
  workspaceId: string
  url: string
  position: number
  createdAt: number
}
```

### Updated `LayoutNode`

```ts
export type LayoutNode =
  | { type: 'pane';    id: string; terminalId: string }
  | { type: 'browser'; id: string; browserPaneId: string }  // NEW
  | { type: 'split';   id: string; direction: LayoutDirection; sizes: number[]; children: LayoutNode[] }
```

### SQLite — new table

```sql
CREATE TABLE IF NOT EXISTS browser_panes (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  url          TEXT NOT NULL DEFAULT 'about:blank',
  position     INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL
);
```

---

## Frontend

### New files

**`src/components/WorkspaceView/BrowserPane.tsx`**
- Props: `browserPaneId`, `isActive`, `onFocus`, `onClose`, `onSplit`, `onToggleMaximize`
- Renders header bar + transparent hole div
- `useRef` on hole div, `ResizeObserver` + `useLayoutEffect` trigger `resize_browser_pane`
- Listens to Tauri `browser-pane-url-changed` event to update URL bar
- On unmount: calls `hide_browser_pane` (not destroy — workspace switch may re-show it)
- On explicit close: calls `destroy_browser_pane`

### Modified files

**`src/types/index.ts`** — add `BrowserPane`, update `LayoutNode`

**`src/store/useAppStore.ts`**
- Add `browserPanesByWorkspace: Record<string, BrowserPane[]>`
- Add `addBrowserPane(workspaceId, pane, targetId?, direction?)`
- Add `removeBrowserPane(workspaceId, id)`
- Browser pane URLs are persisted via Tauri (not localStorage)

**`src/components/WorkspaceView/TerminalGrid.tsx`**
- `renderLayoutNode` handles `type: 'browser'` by rendering `BrowserPane`

**`src/components/WorkspaceView/WorkspaceView.tsx`**
- Add `handleAddBrowserPane()` — calls `create_browser_pane` Rust command, adds to store + layout
- Add `handleCloseBrowserPane(id)` — calls `destroy_browser_pane`, removes from store

**`src/components/WorkspaceView/WorkspaceHeader.tsx`**
- Add `+ Browser` button alongside `+ Terminal`

**`src/App.tsx`**
- On workspace activate: load and restore browser panes from DB (similar to terminals)
- On workspace switch: call `show`/`hide` for browser panes of respective workspaces

---

## Backend (Rust)

### New file: `src-tauri/src/browser_pane_manager.rs`

```rust
pub struct BrowserPaneManager {
    panes: Mutex<HashMap<String, tauri::Webview>>,
}

impl BrowserPaneManager {
    pub fn create(&self, window: &Window, id: &str, url: &str, x: f64, y: f64, w: f64, h: f64)
    pub fn navigate(&self, id: &str, url: &str)
    pub fn set_bounds(&self, id: &str, x: f64, y: f64, w: f64, h: f64)
    pub fn go_back(&self, id: &str)
    pub fn go_forward(&self, id: &str)
    pub fn reload(&self, id: &str)
    pub fn show(&self, id: &str)
    pub fn hide(&self, id: &str)
    pub fn destroy(&self, id: &str)
}
```

### New Tauri commands (`src-tauri/src/commands.rs`)

| Command | Description |
|---|---|
| `create_browser_pane(id, url, x, y, w, h)` | Spawn child webview + save to DB |
| `navigate_browser_pane(id, url)` | Navigate to URL + update DB |
| `resize_browser_pane(id, x, y, w, h)` | Reposition/resize native webview |
| `show_browser_pane(id)` | Make webview visible |
| `hide_browser_pane(id)` | Make webview invisible |
| `destroy_browser_pane(id)` | Kill webview + remove from DB |
| `go_back(id)` / `go_forward(id)` / `reload(id)` | Navigation controls |
| `get_browser_panes(workspaceId)` | Load panes from DB on restore |

### DB changes (`src-tauri/src/db.rs`)

- `create_browser_panes_table()` called at startup
- `create_browser_pane(conn, id, workspace_id, url)`
- `get_browser_panes(conn, workspace_id) -> Vec<BrowserPane>`
- `update_browser_pane_url(conn, id, url)`
- `delete_browser_pane(conn, id)`
- `delete_browser_panes_for_workspace(conn, workspace_id)` — called when workspace deleted

### `src-tauri/src/lib.rs`

- Register `BrowserPaneManager` as Tauri managed state
- Register all new commands in `tauri::Builder`

---

## Error handling

- If `create_browser_pane` fails (Tauri API error), show toast and do not add pane to layout
- If `resize_browser_pane` fails, log warning but do not crash — next resize event will retry
- On restore, if a saved browser pane fails to spawn, skip it and continue loading others

---

## Out of scope

- Browser history persistence (only the current URL is saved)
- Multiple tabs within a single browser pane
- DevTools access from within the pane
- Ad blocking or custom user agents
