# Editor Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform EditorPane into a multi-file tabbed environment with persistence and image support.

**Architecture:** Update Zustand store for tab and layout state; refactor EditorPane to render multiple tabs and handle image formats using Tauri's asset protocol. Persist editor state via Zustand localStorage.

**Tech Stack:** React, TypeScript, Zustand, Monaco Editor, Lucide React, Tauri v2.

---

### Task 1: Store & Type Updates

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/store/useAppStore.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Update EditorPane and Settings types**

Modify `src/types/index.ts`:
```typescript
export interface EditorPane {
  id: string
  workspaceId: string
  rootPath: string
  openFiles: string[]
  activeFilePath: string | null
  mruStack: string[]
  fileTreeWidth: number
  position: number
  createdAt: number
}

export interface Settings {
  theme: 'warm-dark' | 'cold-dark' | 'light' | 'catppuccin-mocha' | 'synthwave' | 'fruity'
  fontSize: number
  timeFormat: '12h' | '24h'
  keybindings: Keybindings
  autosave: boolean
}
```

- [ ] **Step 2: Update store actions and persistence**

Modify `src/store/useAppStore.ts`:
```typescript
// Update updateEditorPaneFile to handle tabs and MRU
updateEditorPaneFile: (workspaceId, editorPaneId, openFilePath) =>
  set((s) => {
    return {
      editorPanesByWorkspace: {
        ...s.editorPanesByWorkspace,
        [workspaceId]: (s.editorPanesByWorkspace[workspaceId] ?? []).map((p) => {
          if (p.id !== editorPaneId) return p
          
          if (!openFilePath) return { ...p, activeFilePath: null }
          
          const newOpenFiles = p.openFiles.includes(openFilePath) 
            ? p.openFiles 
            : [...p.openFiles, openFilePath]
            
          const newMruStack = [openFilePath, ...p.mruStack.filter(f => f !== openFilePath)]
          
          return { 
            ...p, 
            openFiles: newOpenFiles, 
            activeFilePath: openFilePath,
            mruStack: newMruStack 
          }
        }),
      },
    }
  }),

// Add closeEditorFile action to AppState and implementation
closeEditorFile: (workspaceId, paneId, filePath) =>
  set((s) => ({
    editorPanesByWorkspace: {
      ...s.editorPanesByWorkspace,
      [workspaceId]: (s.editorPanesByWorkspace[workspaceId] ?? []).map((p) => {
        if (p.id !== paneId) return p
        const newOpenFiles = p.openFiles.filter(f => f !== filePath)
        const newMruStack = p.mruStack.filter(f => f !== filePath)
        const newActive = p.activeFilePath === filePath 
          ? (newMruStack[0] ?? null)
          : p.activeFilePath
        return { ...p, openFiles: newOpenFiles, mruStack: newMruStack, activeFilePath: newActive }
      })
    }
  })),

// Add updateEditorPaneLayout action to AppState and implementation
updateEditorPaneLayout: (workspaceId, paneId, layout) =>
  set((s) => ({
    editorPanesByWorkspace: {
      ...s.editorPanesByWorkspace,
      [workspaceId]: (s.editorPanesByWorkspace[workspaceId] ?? []).map((p) => 
        p.id === paneId ? { ...p, ...layout } : p
      )
    }
  })),

// Update partialize to include editorPanesByWorkspace
partialize: (state) => ({ 
  settings: state.settings,
  layoutsByWorkspace: state.layoutsByWorkspace,
  browserHistory: state.browserHistory,
  editorPanesByWorkspace: state.editorPanesByWorkspace
}),
```

- [ ] **Step 3: Update Editor initialization in App.tsx**

Modify `src/App.tsx` `onNewEditor` handler:
```typescript
            const pane: EditorPane = {
              id: Math.random().toString(36).substring(2, 9),
              workspaceId: activeWorkspaceId,
              rootPath,
              openFiles: [],
              activeFilePath: null,
              mruStack: [],
              fileTreeWidth: 20,
              position: currentPanes.length,
              createdAt: Date.now()
            }
```

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts src/store/useAppStore.ts src/App.tsx
git commit -m "feat: update store and initialization for editor enhancements"
```

### Task 2: Implement Tab Bar Component

**Files:**
- Modify: `src/components/EditorPane.tsx`

- [ ] **Step 1: Add Tab Bar UI and refactor active file logic**

Refactor `EditorPane.tsx` to use `editorPane.activeFilePath` instead of `editorPane.openFilePath`.
Add the Tab Bar UI below the breadcrumbs.

```tsx
{/* Tab Bar */}
<div className="flex bg-[var(--bg-secondary)] border-b border-[var(--border-inactive)] overflow-x-auto no-scrollbar h-9 items-center px-2 gap-1">
  {editorPane.openFiles.map(path => (
    <div 
      key={path}
      onClick={() => updateEditorPaneFile(workspaceId, editorPaneId, path)}
      className={`flex items-center h-full px-3 gap-2 border-r border-[var(--border-inactive)] cursor-pointer transition-colors ${editorPane.activeFilePath === path ? 'bg-[var(--bg-primary)] text-[var(--accent)] border-t-2 border-t-[var(--accent)]' : 'text-[var(--text-dim)] hover:bg-[var(--bg-primary)] hover:bg-opacity-50'}`}
    >
      <FileCode size={12} />
      <span className="text-[11px] whitespace-nowrap">{path.split('/').pop()}</span>
      <button 
        onClick={(e) => { e.stopPropagation(); closeEditorFile(workspaceId, editorPaneId, path); }}
        className="p-0.5 hover:bg-[var(--border-inactive)] rounded"
      >
        <X size={12} />
      </button>
    </div>
  ))}
</div>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/EditorPane.tsx
git commit -m "feat: add tab bar and refactor active file logic in EditorPane"
```

### Task 3: Image Preview & Persistence

**Files:**
- Modify: `src/components/EditorPane.tsx`

- [ ] **Step 1: Add image detection and Tauri asset conversion**

Modify `src/components/EditorPane.tsx`:
```tsx
import { convertFileSrc } from '@tauri-apps/api/core'

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'svg']
const isImageFile = (path: string | null) => {
  if (!path) return false
  const ext = path.split('.').pop()?.toLowerCase()
  return ext ? IMAGE_EXTENSIONS.includes(ext) : false
}

// In render logic:
{isImageFile(editorPane.activeFilePath) ? (
  <div className="absolute inset-0 flex items-center justify-center p-8 bg-[var(--bg-secondary)] checkerboard overflow-auto">
    <img 
      src={convertFileSrc(editorPane.activeFilePath!)} 
      alt="Preview" 
      className="max-w-full max-h-full object-contain shadow-2xl"
    />
  </div>
) : (
  <Editor ... />
)}
```

- [ ] **Step 2: Update Panel persistence**

Update `Panel` in `EditorPane.tsx`:
```tsx
<Panel 
  defaultSize={editorPane.fileTreeWidth || 20} 
  onResize={(size) => updateEditorPaneLayout(workspaceId, editorPaneId, { fileTreeWidth: size })}
>
  <FileTree rootPath={editorPane.rootPath} onFileSelect={handleFileSelect} />
</Panel>
```

- [ ] **Step 3: Commit**

```bash
git add src/components/EditorPane.tsx
git commit -m "feat: add image preview and layout persistence"
```

### Task 4: Global Autosave

**Files:**
- Modify: `src/components/EditorPane.tsx`
- Modify: `src/components/SettingsModal/SettingsModal.tsx`
- Modify: `src/store/useAppStore.ts` (default setting)

- [ ] **Step 1: Add Autosave toggle to SettingsModal**

Modify `src/components/SettingsModal/SettingsModal.tsx`:
Add a checkbox/toggle in the "Application" section for Autosave.

```tsx
<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
  <input
    type="checkbox"
    id="autosave"
    checked={autosave}
    onChange={(e) => setAutosave(e.target.checked)}
  />
  <label htmlFor="autosave" style={{ fontSize: 13, color: 'var(--text-inactive)', fontWeight: 500 }}>
    Enable Global Autosave (1s debounce)
  </label>
</div>
```

- [ ] **Step 2: Implement debounce logic in EditorPane**

Modify `src/components/EditorPane.tsx`:
```tsx
useEffect(() => {
  if (!settings.autosave || !isDirty || !editorPane.activeFilePath) return
  
  const timer = setTimeout(() => {
    handleSave()
  }, 1000)
  
  return () => clearTimeout(timer)
}, [isDirty, settings.autosave, editorPane.activeFilePath])
```

- [ ] **Step 3: Update default settings in useAppStore.ts**

Set `autosave: false` by default in `settings` initialization.

- [ ] **Step 4: Commit**

```bash
git add src/components/EditorPane.tsx src/components/SettingsModal/SettingsModal.tsx src/store/useAppStore.ts
git commit -m "feat: implement global autosave setting"
```
