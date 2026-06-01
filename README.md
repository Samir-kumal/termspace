# termspace

A modern, keyboard-driven terminal workspace manager built with Tauri + React + TypeScript.

Termspace lets you create named workspaces, each with a fully configurable grid of terminal panes. Split, resize, drag-and-drop, and search — all from one window.

![termspace](docs/screenshot.png)

---

## Features

- **Workspaces** — Named terminal sessions you can create, rename, and delete
- **Split Pane Layout** — Arbitrary horizontal/vertical splits with resizable panels
- **Drag-and-Drop Reordering** — Drag terminals into new positions within a workspace
- **Custom Keybindings** — Configure global shortcuts for core actions
- **Search (Ctrl+F)** — Full-text search within terminal output
- **Context Menus** — Right-click terminals or workspaces for quick actions
- **Toast Notifications** — Non-intrusive confirmation feedback for background actions
- **Settings** — Configure shell, font size, themes, and keybindings

## Tech Stack

| Layer | Tech |
|-------|------|
| App shell | [Tauri v2](https://tauri.app) (Rust) |
| Frontend | React 19 + TypeScript |
| Terminal | xterm.js v6 |
| State | Zustand |
| Animations | Framer Motion |
| Build | Vite 7 |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) 18+
- [Rust](https://rustup.rs) (stable toolchain)
- Tauri CLI: `npm install -g @tauri-apps/cli`

### Development

```bash
npm install
npm run tauri dev
```

### Build

```bash
npm run tauri build
```

Outputs a platform-native installer to `src-tauri/target/release/bundle/`.

## Project Structure

```
termspace/
├── src/                  # React frontend
│   ├── components/       # UI components
│   ├── store/            # Zustand state
│   └── types/            # TypeScript types
├── src-tauri/            # Rust/Tauri backend
│   ├── src/              # Rust source
│   └── tauri.conf.json   # App config
└── docs/                 # Documentation assets
```

## Roadmap

See [open issues](../../issues) for planned features and known bugs.

| Feature | Status |
|---------|--------|
| Split pane layout | ✅ Done |
| Drag-and-drop reorder | ✅ Done |
| Custom keybindings | ✅ Done |
| Search (Ctrl+F) | ✅ Done |
| Context menus | ✅ Done |
| Toast notifications | ✅ Done |
| Terminal tabs overlay | 🗓 Planned |
| Command palette (Cmd+K) | 🗓 Planned |
| State persistence | 🗓 Planned |

## Versioning

This project follows [Semantic Versioning](https://semver.org). See [releases](../../releases) for the changelog.

## License

MIT
