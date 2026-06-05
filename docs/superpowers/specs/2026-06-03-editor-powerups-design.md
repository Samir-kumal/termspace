# Design Spec: Editor Power-Ups

## Overview
Transform the Termspace Editor into a production-grade development environment by adding side-by-side splitting, cross-file content search, Git status visualization, and high-performance virtualization for large projects.

## 1. Split Editor Support

### 1.1 Store Actions (`src/store/useAppStore.ts`)
- `splitEditor(workspaceId: string, editorPaneId: string, direction: 'horizontal' | 'vertical')`:
    - Locates the `EditorPane` in the layout tree.
    - Replaces it with a `split` node.
    - The `split` node contains the original `EditorPane` and a new `EditorPane` clone.
    - The clone starts with the same `rootPath`, `openFiles`, and `activeFilePath` as the original.

### 1.2 UI Enhancements (`src/components/EditorPane.tsx`)
- Add `Columns` (Split Right) and `Rows` (Split Down) icons from `lucide-react` to the header actions.
- Clicking an icon triggers `splitEditor`.

## 2. Content Search (Cmd+K)

### 2.1 Logic
- Enhance `CommandPalette.tsx` to handle content searching.
- When the search query is > 2 characters:
    - Iterate through `openFiles` across all `EditorPanes` in the active workspace.
    - Use a regex or simple `includes` to find matches in the cached file content (or re-read if necessary).
    - Limit results to the first 5 matches per file to avoid overwhelming the UI.

### 2.2 UI
- New result category: "Matches in Open Files".
- Each result shows: `Filename:LineNumber` and a code snippet with the match highlighted.
- Selection behavior: Switches to the file and uses Monaco's `revealLine` to scroll to the match.

## 3. Git Status Indicators

### 3.1 Backend (`src-tauri/src/commands.rs`)
- New command `get_git_status(path: string) -> Result<HashMap<string, string>, String>`:
    - Runs `git status --porcelain`.
    - Parses output into a map of `filePath -> status_code` (e.g., `M`, `A`, `D`, `??`).

### 3.2 Frontend (`src/store/useAppStore.ts`)
- Add `gitStatusByWorkspace: Record<string, Record<string, string>>` to state.
- Add `refreshGitStatus(workspaceId: string)` action.

### 3.3 UI
- **File Tree:** Files in `TreeNode` get color-coded text or icons based on their status.
- **Editor Gutter:** Add a decorative line indicator in the Monaco gutter (via `setDecorations`) for modified lines (requires diffing against HEAD, simplified version: just a per-file status indicator in the header).

## 4. Virtualized File Tree

### 4.1 Logic
- Refactor `FileTree.tsx` to flatten the nested directory structure into a linear array:
    ```typescript
    type FlatNode = { path: string, name: string, depth: number, isDirectory: boolean, isOpen: boolean }
    ```
- Only visible nodes (those whose parents are all open) are included in the array.

### 4.2 UI
- Use `react-window` (or a custom lightweight implementation if library installation is restricted) to render only the visible subset of the flat array.
- This ensures O(1) rendering performance regardless of the number of files in the project.

## 5. Testing Strategy
- **Split:** Manual verification of independent tab state in split panes.
- **Search:** Unit test the snippet extraction logic.
- **Git:** Verify parsing of `--porcelain` output with a mock repository.
- **Virtualization:** Stress test with a directory containing 10,000+ dummy files.
