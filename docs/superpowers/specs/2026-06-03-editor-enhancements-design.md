# Design Spec: Editor Enhancements (Tabs, Persistence, Images, Autosave)

## Overview
Enhance the current `EditorPane` from a single-file editor to a multi-file, tabbed environment with improved binary handling and persistence.

## 1. Architecture & State Changes

### 1.1 Store Updates (`src/types/index.ts`)
Modify `EditorPane` interface:
```typescript
export interface EditorPane {
  id: string
  workspaceId: string
  rootPath: string
  openFiles: string[]       // List of absolute paths currently open in tabs
  activeFilePath: string | null // The currently visible file
  mruStack: string[]        // Paths ordered by most recently used
  fileTreeWidth: number     // Persistent percentage for the FileTree panel
  position: number
  createdAt: number
}
```

Modify `Settings` interface:
```typescript
export interface Settings {
  // ... existing
  autosave: boolean
}
```

### 1.2 Store Actions (`src/store/useAppStore.ts`)
- `updateEditorPaneFile`: Update to handle adding to `openFiles` and updating `mruStack`.
- `closeEditorFile(workspaceId, paneId, filePath)`: Remove from `openFiles` and `mruStack`.
- `updateEditorPaneLayout(workspaceId, paneId, { fileTreeWidth })`: Persist panel sizes.

## 2. Component Enhancements (`src/components/EditorPane.tsx`)

### 2.1 Tab Bar
- Add a scrollable horizontal bar below the header/breadcrumbs.
- Each tab shows the file name, a "dirty" indicator (dot), and a close button (x).
- Clicking a tab makes it the `activeFilePath`.

### 2.2 MRU Switching
- Implement logic to track usage order in `mruStack`.
- Support `Cmd+Tab` (or similar) to cycle through the stack if requested later (initial implementation focuses on state tracking).

### 2.3 Image Preview
- New helper `isImageFile(path: string)`.
- If `activeFilePath` is an image, use `@tauri-apps/api/core`'s `convertFileSrc` to render a centered `<img>` with a transparent "checkerboard" background.

### 2.4 Persistent Layout
- Replace hardcoded `defaultSize={20}` with `editorPane.fileTreeWidth`.
- Use `onResize` or `onLayout` from `react-resizable-panels` to sync width back to the store.

### 2.5 Global Autosave
- Add `useEffect` with `setTimeout` (1000ms) that calls `handleSave()` if `settings.autosave` is true and `isDirty` is true.
- Clear timeout on any new change (debounce).

## 3. User Interaction Flow
1. User clicks file in `FileTree`.
2. Action adds file to `openFiles` (if new), sets as `activeFilePath`, and moves to top of `mruStack`.
3. If file is an image, it renders immediately.
4. If file is text, Monaco loads content.
5. User resizes FileTree; width is saved to SQLite via Zustand persistence.

## 4. Testing Strategy
- **Unit:** Test `mruStack` logic in `useAppStore.test.ts`.
- **Manual:** Verify image rendering for various formats.
- **Persistence:** Reload app and ensure tab list and sidebar width remain unchanged.
