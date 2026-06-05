# Editor Power-Ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the Editor into a multi-pane, searchable environment with Git status integration and high-performance file tree.

**Architecture:** Use recursive layout splitting for side-by-side editing; implement background Git status polling in Rust; enhance Command Palette with content search; refactor File Tree to use flat-list virtualization.

**Tech Stack:** React, TypeScript, Zustand, Monaco Editor, Rust (Tauri), Lucide React.

---

### Task 1: Split Editor Support

**Files:**
- Modify: `src/store/useAppStore.ts`
- Modify: `src/components/EditorPane.tsx`
- Modify: `src/utils/layout.ts`

- [ ] **Step 1: Ensure addEditorPaneToLayout supports splitting**

Verify `src/utils/layout.ts` contains `addEditorPaneToLayout`. It already does, and it handles creating a split node if a `targetId` is provided.

- [ ] **Step 2: Add splitEditor action to store**

Modify `src/store/useAppStore.ts`:
```typescript
splitEditor: (workspaceId, editorPaneId, direction) =>
  set((s) => {
    const layout = s.layoutsByWorkspace[workspaceId]
    if (!layout) return {}

    const originalPane = s.editorPanesByWorkspace[workspaceId]?.find(p => p.id === editorPaneId)
    if (!originalPane) return {}

    const newPaneId = Math.random().toString(36).substring(2, 9)
    const newPane: EditorPane = {
      ...originalPane,
      id: newPaneId,
      position: (s.editorPanesByWorkspace[workspaceId]?.length || 0),
      createdAt: Date.now()
    }

    // Use existing addEditorPaneToLayout with targetId and direction
    const newLayout = addEditorPaneToLayout(layout, newPaneId, editorPaneId, direction)

    return {
      layoutsByWorkspace: { ...s.layoutsByWorkspace, [workspaceId]: newLayout },
      editorPanesByWorkspace: {
        ...s.editorPanesByWorkspace,
        [workspaceId]: [...(s.editorPanesByWorkspace[workspaceId] || []), newPane]
      }
    }
  }),
```

- [ ] **Step 3: Add Split Buttons to Editor Header**

Modify `src/components/EditorPane.tsx`:
Add `Columns` and `Rows` icons from `lucide-react`.
Add buttons in the actions div (near Save and Close):
```tsx
<button 
  onClick={() => splitEditor(workspaceId, editorPaneId, 'vertical')} 
  style={actionButtonStyle}
  title="Split Right"
>
  <Columns size={14} />
</button>
<button 
  onClick={() => splitEditor(workspaceId, editorPaneId, 'horizontal')} 
  style={actionButtonStyle}
  title="Split Down"
>
  <Rows size={14} />
</button>
```

- [ ] **Step 4: Commit**

```bash
git add src/store/useAppStore.ts src/components/EditorPane.tsx src/utils/layout.ts
git commit -m "feat: add split editor support"
```

### Task 2: Git Status Integration (Backend & Store)

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/store/useAppStore.ts`
- Modify: `src/types/index.ts`

- [ ] **Step 1: Implement get_git_status Rust command**

Modify `src-tauri/src/commands.rs`:
Add `use std::collections::HashMap;` at the top.
```rust
#[tauri::command]
pub fn get_git_status(path: String) -> Result<HashMap<String, String>, String> {
    let output = std::process::Command::new("git")
        .args(["status", "--porcelain"])
        .current_dir(path)
        .output()
        .map_err(|e| e.to_string())?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut status_map = HashMap::new();

    for line in stdout.lines() {
        if line.len() > 3 {
            let status = line[..2].trim().to_string();
            let file_path = line[3..].to_string();
            status_map.insert(file_path, status);
        }
    }
    Ok(status_map)
}
```
Register command in `src-tauri/src/lib.rs`.

- [ ] **Step 2: Update store state and add refreshGitStatus action**

Modify `src/types/index.ts`:
Add `gitStatusByWorkspace: Record<string, Record<string, string>>` to `AppState`.

Modify `src/store/useAppStore.ts`:
Add `refreshGitStatus` implementation using `invoke('get_git_status', { path: rootPath })`.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs src/store/useAppStore.ts src/types/index.ts
git commit -m "feat: implement git status backend and store"
```

### Task 3: Git Status UI

**Files:**
- Modify: `src/components/FileTree.tsx`
- Modify: `src/components/EditorPane.tsx`

- [ ] **Step 1: Color-code File Tree labels**

Modify `src/components/FileTree.tsx`:
Extract `gitStatus` from store for current workspace.
Use `gitStatus[node.path.replace(rootPath + '/', '')]` to find status.
Apply colors to file name text: M = `#FBC02D`, A = `#4CAF50`, D = `#F44336`.

- [ ] **Step 2: Add status badge to Tab Bar**

Modify `src/components/EditorPane.tsx`:
Show a small M, A, or D indicator in the tab if file is in `gitStatus`.

- [ ] **Step 3: Commit**

```bash
git add src/components/FileTree.tsx src/components/EditorPane.tsx
git commit -m "feat: add git status colors to file tree and tabs"
```

### Task 4: Content Search (Cmd+K)

**Files:**
- Modify: `src/components/CommandPalette/CommandPalette.tsx`

- [ ] **Step 1: Implement content search logic**

Modify `src/components/CommandPalette/CommandPalette.tsx`:
Add a `useEffect` that triggers when `query.length > 2`.
Loop through `openFiles` across all panes.
For each file, search lines for `query`.
Return up to 3 matches per file as special `Action` objects.

- [ ] **Step 2: Commit**

```bash
git add src/components/CommandPalette/CommandPalette.tsx
git commit -m "feat: add content search to command palette"
```

### Task 5: Virtualized File Tree

**Files:**
- Modify: `src/components/FileTree.tsx`

- [ ] **Step 1: Refactor to flat list logic**

Modify `src/components/FileTree.tsx`:
Implement `useMemo` to compute a flat array of `{ node, depth, visible }`.
A node is visible if all its parent directories are `isOpen`.

- [ ] **Step 2: Implement Simple Subset Rendering**

Instead of rendering thousands of components, render only the first 100 visible nodes (as a simple virtualization starting point) or use a scroll listener to render a sliding window.

- [ ] **Step 3: Commit**

```bash
git add src/components/FileTree.tsx
git commit -m "feat: implement virtualized file tree logic"
```
