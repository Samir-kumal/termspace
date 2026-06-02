//! Native child-webview pane manager.
//!
//! External sites cannot be embedded via `<iframe>` because of `X-Frame-Options`
//! / CSP `frame-ancestors`. Instead we spawn a real Tauri child webview
//! (`WKWebView` on macOS) positioned at pixel coordinates inside the main
//! window. React draws a transparent placeholder at the same rectangle and the
//! native webview floats behind it.
//!
//! Lifecycle (create / navigate / resize / show / hide / destroy) is owned here.
//! All state is guarded by a single `Mutex` keyed by the React-side pane id.
//!
//! NOTE: `Window::add_child` is gated behind Tauri's `unstable` feature, which
//! is enabled in `Cargo.toml`.

use std::collections::HashMap;
use std::sync::Mutex;

use tauri::{Emitter, LogicalPosition, LogicalSize, WebviewBuilder, WebviewUrl, WebviewWindow, Manager};

/// Offscreen coordinates used to "hide" a pane without destroying it. Keeping
/// the webview alive preserves its navigation/session state, so showing it
/// again is instant and does not re-trigger a network load.
const HIDDEN_X: f64 = -10_000.0;
const HIDDEN_Y: f64 = -10_000.0;

/// A live native webview plus its last-known on-screen bounds. Bounds are
/// cached so `show()` can restore the rectangle after a `hide()`.
struct PaneEntry {
    webview: tauri::Webview,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
    /// When true the pane is parked offscreen. `set_bounds` updates the cached
    /// rectangle but must NOT push it to the live webview, otherwise a layout
    /// reflow would visibly re-show a pane the user deliberately hid.
    is_hidden: bool,
}

/// Owns every native browser-pane webview for the application.
///
/// Stored in Tauri managed state (registered in `lib.rs` by Task 3) and shared
/// across command invocations. The internal `HashMap` gives O(1) lookup by id.
pub struct BrowserPaneManager {
    panes: Mutex<HashMap<String, PaneEntry>>,
}

impl Default for BrowserPaneManager {
    fn default() -> Self {
        Self::new()
    }
}

impl BrowserPaneManager {
    pub fn new() -> Self {
        Self {
            panes: Mutex::new(HashMap::new()),
        }
    }

    /// Creates a native child webview at the given logical rectangle and tracks
    /// it under `id`. Navigation events are emitted to the frontend as
    /// `browser-pane-url-changed` so React can persist the current URL.
    ///
    /// Idempotency: callers must ensure ids are unique. Re-creating an existing
    /// id would build a second webview with a duplicate label and error out at
    /// the runtime layer, so the manager refuses duplicates up front.
    pub fn create(
        &self,
        window: &WebviewWindow,
        app: &tauri::AppHandle,
        id: &str,
        url: &str,
        x: f64,
        y: f64,
        w: f64,
        h: f64,
    ) -> Result<(), tauri::Error> {
        // Reject non-positive dimensions. This is a transient startup race
        // (React mounts the placeholder before its rect has been measured), so
        // we skip creation and let the follow-up `set_bounds` drive sizing
        // rather than building a degenerate webview.
        if w <= 0.0 || h <= 0.0 {
            return Ok(());
        }

        // Reject duplicate ids before touching the runtime so we never leak a
        // half-built webview that the map does not track.
        {
            let panes = self.panes.lock().unwrap();
            if panes.contains_key(id) {
                return Ok(());
            }
        }

        let app_handle = app.clone();
        let id_owned = id.to_string();

        // Parse defensively: a malformed/empty URL must not panic the command
        // thread. Fall back to https://google.com, mirroring browser behavior.
        let target_url = url
            .parse()
            .unwrap_or_else(|_| "https://google.com".parse().expect("https://google.com is a valid URL"));

        let nav_app_handle = app_handle.clone();
        let nav_id = id_owned.clone();
        
        let popup_app_handle = app_handle.clone();
        let popup_id = id_owned.clone();

        let data_dir = app_handle.path().app_data_dir().unwrap_or_else(|_| std::path::PathBuf::from("/tmp")).join("browser_profile");

        let builder = WebviewBuilder::new(format!("browser-pane-{}", id), WebviewUrl::External(target_url))
            .data_directory(data_dir)
            .on_navigation(move |nav_url| {
                println!(">>> BROWSER: Navigation requested to: {}", nav_url);
                // Returning `true` allows the navigation to proceed. We only
                // observe it to keep the frontend's URL state in sync.
                let _ = nav_app_handle.emit(
                    "browser-pane-url-changed",
                    serde_json::json!({
                        "id": nav_id,
                        "url": nav_url.to_string(),
                    }),
                );
                true
            })
            .on_page_load(|_webview, payload| {
                println!(">>> BROWSER: Page load event: {:?}", payload.url());
            })
            .on_new_window(move |nav_url, _features| {
                println!(">>> BROWSER: Popup requested to: {}", nav_url);
                let _ = popup_app_handle.emit(
                    "browser-pane-popup-requested",
                    serde_json::json!({
                        "id": popup_id,
                        "url": nav_url.to_string(),
                    }),
                );
                tauri::webview::NewWindowResponse::Deny
            })
            .on_download(move |_url, _event| {
                println!(">>> BROWSER: Download started");
                true // allow download, will trigger default OS save dialog (or automatic download to ~/Downloads)
            });

        // `add_child` lives on `Window`, not `WebviewWindow`. `WebviewWindow`
        // exposes its inner `Webview` via `AsRef`, and `Webview::window()`
        // returns the hosting `Window`.
        let parent = window.as_ref().window();
        let webview = parent.add_child(builder, LogicalPosition::new(x, y), LogicalSize::new(w, h))?;

        self.panes
            .lock()
            .unwrap()
            .insert(id.to_string(), PaneEntry { webview, x, y, w, h, is_hidden: false });
        Ok(())
    }

    /// Navigates an existing pane to `url`. Surfaces a missing pane id or an
    /// unparseable URL as an error rather than silently dropping the request,
    /// so the frontend can distinguish "did nothing" from "could not".
    pub fn navigate(&self, id: &str, url: &str) -> Result<(), String> {
        let panes = self.panes.lock().unwrap();
        let entry = panes
            .get(id)
            .ok_or_else(|| format!("pane '{}' not found", id))?;
        let parsed: tauri::Url = url
            .parse()
            .map_err(|e| format!("invalid URL '{}': {}", url, e))?;
        entry.webview.navigate(parsed).map_err(|e| e.to_string())
    }

    /// Repositions and resizes a pane, updating the cached bounds so a later
    /// `show()` restores this rectangle rather than a stale one.
    pub fn set_bounds(&self, id: &str, x: f64, y: f64, w: f64, h: f64) {
        println!(">>> BROWSER: set_bounds for '{}' -> x:{}, y:{}, w:{}, h:{}", id, x, y, w, h);
        // Drop non-positive rectangles (transient measurement races); pushing a
        // zero/negative size to the runtime is undefined and could clobber a
        // valid cached rect.
        if w <= 0.0 || h <= 0.0 {
            return;
        }
        let mut panes = self.panes.lock().unwrap();
        if let Some(entry) = panes.get_mut(id) {
            entry.x = x;
            entry.y = y;
            entry.w = w;
            entry.h = h;
            // While hidden, only update the cached rect. `show()` will apply it
            // to the live webview; applying it here would visibly un-hide.
            if !entry.is_hidden {
                let _ = entry.webview.set_position(LogicalPosition::new(x, y));
                let _ = entry.webview.set_size(LogicalSize::new(w, h));
            }
        }
    }

    pub fn go_back(&self, id: &str) {
        let panes = self.panes.lock().unwrap();
        if let Some(entry) = panes.get(id) {
            let _ = entry.webview.eval("history.back()");
        }
    }

    pub fn go_forward(&self, id: &str) {
        let panes = self.panes.lock().unwrap();
        if let Some(entry) = panes.get(id) {
            let _ = entry.webview.eval("history.forward()");
        }
    }

    pub fn reload(&self, id: &str) {
        let panes = self.panes.lock().unwrap();
        if let Some(entry) = panes.get(id) {
            let _ = entry.webview.eval("location.reload()");
        }
    }

    /// Hides a pane by moving it offscreen and shrinking it to 1x1. The webview
    /// stays alive (session/scroll/navigation state preserved) so `show()` is
    /// instant and does not refetch.
    pub fn hide(&self, id: &str) {
        let mut panes = self.panes.lock().unwrap();
        if let Some(entry) = panes.get_mut(id) {
            entry.is_hidden = true;
            let _ = entry.webview.set_position(LogicalPosition::new(HIDDEN_X, HIDDEN_Y));
            let _ = entry.webview.set_size(LogicalSize::new(1.0_f64, 1.0_f64));
        }
    }

    /// Restores a previously hidden pane to its last-known bounds.
    pub fn show(&self, id: &str) {
        let mut panes = self.panes.lock().unwrap();
        if let Some(entry) = panes.get_mut(id) {
            entry.is_hidden = false;
            let _ = entry.webview.set_position(LogicalPosition::new(entry.x, entry.y));
            let _ = entry.webview.set_size(LogicalSize::new(entry.w, entry.h));
        }
    }

    /// Destroys a pane's native webview and drops its entry. Idempotent: a
    /// missing id is a no-op.
    pub fn destroy(&self, id: &str) {
        let mut panes = self.panes.lock().unwrap();
        if let Some(entry) = panes.remove(id) {
            let _ = entry.webview.close();
        }
    }
}
