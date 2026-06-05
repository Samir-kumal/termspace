# Content Search (Cmd+K) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a content search feature in the Command Palette that scans open files and displays matches with snippets and line numbers.

**Architecture:** Add a Rust backend command `search_in_files` that performs a case-insensitive search across a list of paths. The frontend will trigger this command when the Command Palette query length > 2 and display the results in a "Matches in Open Files" category.

**Tech Stack:** Rust (Tauri), React (TypeScript), Zustand, Lucide React (for icons).

---

### Task 1: Backend Search Command

**Files:**
- Modify: `termspace/src-tauri/src/commands.rs`
- Modify: `termspace/src-tauri/src/lib.rs`

- [ ] **Step 1: Add `SearchMatch` struct and `search_in_files` command to `commands.rs`**

```rust
#[derive(serde::Serialize)]
pub struct SearchMatch {
    pub path: String,
    pub line_number: usize,
    pub content: String,
}

#[tauri::command]
pub fn search_in_files(paths: Vec<String>, query: String) -> Result<Vec<SearchMatch>, String> {
    let mut results = Vec::new();
    let query_lower = query.to_lowercase();

    for path in paths {
        let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        for (idx, line) in content.lines().enumerate() {
            if line.to_lowercase().contains(&query_lower) {
                results.push(SearchMatch {
                    path: path.clone(),
                    line_number: idx + 1,
                    content: line.trim().to_string(),
                });
            }
            if results.length() > 100 { break; } // Limit results
        }
        if results.length() > 100 { break; }
    }
    Ok(results)
}
```

- [ ] **Step 2: Register `search_in_files` in `lib.rs`**

```rust
// In tauri::Builder::default().invoke_handler(tauri::generate_handler![...])
commands::search_in_files,
```

---

### Task 2: Extend Action Interface

**Files:**
- Modify: `termspace/src/components/CommandPalette/CommandPalette.tsx`

- [ ] **Step 1: Update `Action` interface and add search state**

```typescript
interface Action {
  id: string
  label: string
  icon?: React.ReactNode
  onSelect: () => void
  isSearchMatch?: boolean
  snippet?: string
  path?: string
  lineNumber?: number
}
```

- [ ] **Step 2: Add `searchResults` state and `useEffect` for searching**

```typescript
const [searchResults, setSearchResults] = useState<Action[]>([])
const activeWorkspaceId = useAppStore(s => s.activeWorkspaceId)
const editorPanes = useAppStore(s => s.editorPanesByWorkspace[activeWorkspaceId || ''] || [])

useEffect(() => {
  if (query.length <= 2) {
    setSearchResults([])
    return
  }

  const allOpenFiles = Array.from(new Set(editorPanes.flatMap(p => p.openFiles)))
  if (allOpenFiles.length === 0) return

  const timer = setTimeout(async () => {
    try {
      const matches = await invoke<any[]>('search_in_files', { paths: allOpenFiles, query })
      const searchActions: Action[] = matches.map((m, i) => ({
        id: `search-match-${i}`,
        label: `${m.path.split('/').pop()}:${m.line_number}`,
        snippet: m.content,
        path: m.path,
        lineNumber: m.line_number,
        isSearchMatch: true,
        onSelect: () => {
          // Logic to open file at line number
          console.log(`Open ${m.path} at ${m.line_number}`)
        }
      }))
      setSearchResults(searchActions)
    } catch (e) {
      console.error('Search failed:', e)
    }
  }, 300) // Debounce

  return () => clearTimeout(timer)
}, [query, editorPanes])
```

---

### Task 3: Render Search Results

**Files:**
- Modify: `termspace/src/components/CommandPalette/CommandPalette.tsx`

- [ ] **Step 1: Update rendering logic to include search matches**

```tsx
const allActions = useMemo(() => [...filteredActions, ...searchResults], [filteredActions, searchResults])

// In the map function:
{allActions.map((action, i) => {
  const isActive = i === selectedIndex
  return (
    <div key={action.id} ...>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontSize: 14, fontWeight: isActive ? 500 : 400 }}>{action.label}</span>
        {action.snippet && (
          <span style={{ fontSize: 12, color: 'var(--text-inactive)', opacity: 0.8 }}>
            {action.snippet}
          </span>
        )}
      </div>
    </div>
  )
})}
```

---

### Task 4: Verify and Refine

- [ ] **Step 1: Test with multiple open files**
- [ ] **Step 2: Ensure scrolling works with many results**
- [ ] **Step 3: Verify "Open file at line" logic (requires `updateEditorPaneFile` update if line jumping is supported)**
