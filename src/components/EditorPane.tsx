import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import Editor, { useMonaco } from '@monaco-editor/react'
import { X, Save, Image as ImageIcon, FileCode, ChevronRight, Columns, Rows, Eye, EyeOff } from 'lucide-react'
import { FileTree } from './FileTree'
import { ConfirmModal } from './ConfirmModal/ConfirmModal'
import { MarkdownPreview } from './MarkdownPreview'
import { readTextFileContent, writeTextFileContent } from '../utils/fs'
import { useAppStore } from '../store/useAppStore'
import { convertFileSrc } from '@tauri-apps/api/core'

interface EditorPaneComponentProps {
  workspaceId: string
  editorPaneId: string
  isActive?: boolean
}

const BINARY_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'svg', 'zip', 'tar', 'gz', 'mp4', 'mp3', 'pdf']
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'svg']

const isBinaryFile = (path: string) => {
  const ext = path.split('.').pop()?.toLowerCase()
  return ext ? BINARY_EXTENSIONS.includes(ext) : false
}

const isImageFile = (path: string | null) => {
  if (!path) return false
  const ext = path.split('.').pop()?.toLowerCase()
  return ext ? IMAGE_EXTENSIONS.includes(ext) : false
}

export const EditorPaneComponent: React.FC<EditorPaneComponentProps> = ({
  workspaceId,
  editorPaneId,
  isActive = false,
}) => {
  const editorPane = useAppStore(s => s.editorPanesByWorkspace[workspaceId]?.find(p => p.id === editorPaneId))
  const removeEditorPane = useAppStore(s => s.removeEditorPane)
  const updateEditorPaneFile = useAppStore(s => s.updateEditorPaneFile)
  const updateEditorPaneLayout = useAppStore(s => s.updateEditorPaneLayout)
  const closeEditorFile = useAppStore(s => s.closeEditorFile)
  const splitEditor = useAppStore(s => s.splitEditor)
  const refreshGitStatus = useAppStore(s => s.refreshGitStatus)
  const gitStatus = useAppStore(s => s.gitStatusByWorkspace[workspaceId])
  const addToast = useAppStore(s => s.addToast)
  const settings = useAppStore(s => s.settings)

  const [fileContent, setFileContent] = useState('')
  const [isDirty, setIsDirty] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [showPreview, setShowPreview] = useState(true)
  const [showConfirmDiscard, setShowConfirmDiscard] = useState<{ path: string } | null>(null)
  
  const monaco = useMonaco()
  const editorRef = useRef<any>(null)
  
  useEffect(() => {
    if (editorRef.current && editorPane?.jumpToLine) {
      const line = editorPane.jumpToLine
      editorRef.current.revealLineInCenter(line)
      editorRef.current.setSelection({
        startLineNumber: line,
        startColumn: 1,
        endLineNumber: line,
        endColumn: 1
      })
      editorRef.current.focus()
      
      // Clear jumpToLine after jump to avoid re-jumping
      setTimeout(() => {
        updateEditorPaneLayout(workspaceId, editorPaneId, { jumpToLine: null })
      }, 100)
    }
  }, [editorPane?.jumpToLine, workspaceId, editorPaneId, updateEditorPaneLayout])

  useEffect(() => {
    if (editorPane?.rootPath) {
      refreshGitStatus(workspaceId, editorPane.rootPath)
    }
  }, [workspaceId, editorPane?.rootPath, refreshGitStatus])

  useEffect(() => {
    if (monaco) {
      const ts = monaco.languages.typescript as any

      ts.typescriptDefaults.setCompilerOptions({
        target: ts.ScriptTarget.ES2020,
        allowNonTsExtensions: true,
        moduleResolution: ts.ModuleResolutionKind.NodeJs,
        module: ts.ModuleKind.CommonJS,
        noEmit: true,
        esModuleInterop: true,
        jsx: ts.JsxEmit.React,
        reactNamespace: 'React',
        allowJs: true
      })

      ts.typescriptDefaults.setDiagnosticsOptions({
        noSemanticValidation: false,
        noSyntaxValidation: false,
        diagnosticCodesToIgnore: [2307, 2792]
      })

      ts.javascriptDefaults.setDiagnosticsOptions({
        noSemanticValidation: false,
        noSyntaxValidation: false,
        diagnosticCodesToIgnore: [2307, 2792, 80001]
      })

      const bgMap: Record<string, string> = {
        'warm-dark': '#1c1c1c',
        'cold-dark': '#1a1b26',
        'light': '#ffffff',
        'catppuccin-mocha': '#1e1e2e',
        'synthwave': '#2b213a',
        'fruity': '#1e1e1e'
      }
      const solidBg = bgMap[settings.theme] || '#1c1c1c'
      const baseTheme = settings.theme === 'light' ? 'vs' : 'vs-dark'

      monaco.editor.defineTheme('termspace-dynamic', {
        base: baseTheme,
        inherit: true,
        rules: [],
        colors: {
          'editor.background': '#00000000',
          'editorStickyScroll.background': solidBg,
        }
      })
      monaco.editor.setTheme('termspace-dynamic')
    }
  }, [monaco, settings.theme])

  useEffect(() => {
    const controller = new AbortController()
    
    const loadFile = async () => {
      if (!editorPane?.activeFilePath) {
        setFileContent('')
        setIsDirty(false)
        return
      }
      
      if (isBinaryFile(editorPane.activeFilePath)) {
        setFileContent('')
        setIsDirty(false)
        return
      }

      setIsLoading(true)
      try {
        const content = await readTextFileContent(editorPane.activeFilePath)
        if (controller.signal.aborted) return
        setFileContent(content)
        setIsDirty(false)
      } catch (err: any) {
        if (controller.signal.aborted) return
        console.error('Failed to read file:', err)
        addToast(`Failed to read file: ${err?.message || err}`, 'error')
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      }
    }
    
    loadFile()
    return () => controller.abort()
  }, [editorPane?.activeFilePath, addToast])

  const handleFileSelect = (path: string) => {
    if (isDirty) {
      setShowConfirmDiscard({ path })
      return
    }
    updateEditorPaneFile(workspaceId, editorPaneId, path)
  }

  const confirmDiscard = () => {
    if (showConfirmDiscard) {
      updateEditorPaneFile(workspaceId, editorPaneId, showConfirmDiscard.path)
      setShowConfirmDiscard(null)
    }
  }

  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined) {
      setFileContent(value)
      setIsDirty(true)
    }
  }

  const handleSave = useCallback(async () => {
    if (!editorPane?.activeFilePath || isBinaryFile(editorPane.activeFilePath)) return
    
    try {
      await writeTextFileContent(editorPane.activeFilePath, fileContent)
      setIsDirty(false)
      addToast('File saved', 'success')
      refreshGitStatus(workspaceId, editorPane.rootPath)
    } catch (err) {
      console.error('Failed to save file:', err)
      addToast('Failed to save file', 'error')
    }
  }, [editorPane?.activeFilePath, editorPane?.rootPath, fileContent, addToast, refreshGitStatus, workspaceId])

  const handleEditorDidMount = (editor: any, monaco: any) => {
    editorRef.current = editor
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      handleSave()
    })

    // Handle jumpToLine on initial mount
    if (editorPane?.jumpToLine) {
      const line = editorPane.jumpToLine
      editor.revealLineInCenter(line)
      editor.setSelection({
        startLineNumber: line,
        startColumn: 1,
        endLineNumber: line,
        endColumn: 1
      })
      editor.focus()
      
      // Clear jumpToLine after jump to avoid re-jumping
      setTimeout(() => {
        updateEditorPaneLayout(workspaceId, editorPaneId, { jumpToLine: null })
      }, 100)
    }
  }

  useEffect(() => {
    if (!settings.autosave || !isDirty || !editorPane?.activeFilePath) return
    
    const timer = setTimeout(() => {
      handleSave()
    }, 1000)
    
    return () => clearTimeout(timer)
  }, [isDirty, settings.autosave, editorPane?.activeFilePath, handleSave])

  if (!editorPane) return null

  const fileName = editorPane.activeFilePath ? editorPane.activeFilePath.split('/').pop() : 'No file open'
  const filePathParts = editorPane.activeFilePath ? editorPane.activeFilePath.replace(editorPane.rootPath, '').split('/').filter(Boolean) : []
  const isBinary = editorPane.activeFilePath ? isBinaryFile(editorPane.activeFilePath) : false

  return (
    <div 
      style={{
        display: 'flex', flexDirection: 'column', height: '100%', width: '100%',
        backgroundColor: 'var(--bg-main)', borderRadius: 8, overflow: 'hidden',
        position: 'relative', border: '1px solid',
        borderColor: isActive ? 'var(--accent)' : 'var(--border-inactive)',
        boxShadow: isActive ? '0 10px 25px rgba(0,0,0,0.2)' : '0 4px 6px rgba(0,0,0,0.1)',
        zIndex: isActive ? 10 : 0
      }}
    >
      {/* Header Area */}
      <div style={{
        display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-main)',
        borderBottom: '1px solid var(--border-inactive)', userSelect: 'none', flexShrink: 0
      }}>
        {/* Top Row: Breadcrumbs and Actions */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', height: 32 }}>
           {/* Breadcrumbs */}
           {filePathParts.length > 0 ? (
             <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-dim)', overflow: 'hidden' }}>
               <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>root</span>
               {filePathParts.map((part, idx) => (
                 <React.Fragment key={idx}>
                   <ChevronRight size={10} style={{ flexShrink: 0, opacity: 0.5 }} />
                   <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 150 }}>{part}</span>
                 </React.Fragment>
               ))}
             </div>
           ) : (
             <div style={{ fontSize: 11, color: 'var(--text-dim)', fontStyle: 'italic' }}>No file selected</div>
           )}

           {/* Actions */}
           <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
             <button 
               onClick={handleSave}
               disabled={!isDirty || !editorPane.activeFilePath || isBinary}
               style={{
                 padding: 4, borderRadius: 6, transition: 'colors 0.2s', border: 'none', background: 'none', cursor: (isDirty && !isBinary) ? 'pointer' : 'not-allowed',
                 color: (isDirty && !isBinary) ? 'var(--accent)' : 'var(--text-dim)',
                 opacity: (isDirty && !isBinary) ? 1 : 0.3
               }}
               title="Save (Cmd+S)"
               onMouseEnter={(e) => {
                 if (isDirty && !isBinary) e.currentTarget.style.backgroundColor = 'rgba(6, 182, 212, 0.1)'
               }}
               onMouseLeave={(e) => {
                 e.currentTarget.style.backgroundColor = 'transparent'
               }}
             >
               <Save size={14} />
             </button>

             {editorPane.activeFilePath?.toLowerCase().endsWith('.md') && (
               <button 
                 onClick={() => setShowPreview(!showPreview)} 
                 style={{
                   padding: 4, borderRadius: 4, transition: 'colors 0.2s', border: 'none', background: 'none', cursor: 'pointer',
                   color: showPreview ? 'var(--accent)' : 'var(--text-dim)'
                 }}
                 title={showPreview ? "Hide Preview" : "Show Preview"}
                 onMouseEnter={(e) => {
                   e.currentTarget.style.color = 'var(--text-active)'
                   e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)'
                 }}
                 onMouseLeave={(e) => {
                   e.currentTarget.style.color = showPreview ? 'var(--accent)' : 'var(--text-dim)'
                   e.currentTarget.style.backgroundColor = 'transparent'
                 }}
               >
                 {showPreview ? <EyeOff size={14} /> : <Eye size={14} />}
               </button>
             )}

             {/* Split Buttons */}
             <button 
               onClick={() => splitEditor(workspaceId, editorPaneId, 'horizontal')} 
               style={{
                 padding: 4, borderRadius: 4, transition: 'colors 0.2s', border: 'none', background: 'none', cursor: 'pointer',
                 color: 'var(--text-dim)'
               }}
               title="Split Right"
               onMouseEnter={(e) => {
                 e.currentTarget.style.color = 'var(--text-active)'
                 e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)'
               }}
               onMouseLeave={(e) => {
                 e.currentTarget.style.color = 'var(--text-dim)'
                 e.currentTarget.style.backgroundColor = 'transparent'
               }}
             >
               <Columns size={14} />
             </button>
             <button 
               onClick={() => splitEditor(workspaceId, editorPaneId, 'vertical')} 
               style={{
                 padding: 4, borderRadius: 4, transition: 'colors 0.2s', border: 'none', background: 'none', cursor: 'pointer',
                 color: 'var(--text-dim)'
               }}
               title="Split Down"
               onMouseEnter={(e) => {
                 e.currentTarget.style.color = 'var(--text-active)'
                 e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)'
               }}
               onMouseLeave={(e) => {
                 e.currentTarget.style.color = 'var(--text-dim)'
                 e.currentTarget.style.backgroundColor = 'transparent'
               }}
             >
               <Rows size={14} />
             </button>

             <button 
               onClick={() => removeEditorPane(workspaceId, editorPaneId)}
               style={{
                 padding: 4, borderRadius: 4, transition: 'colors 0.2s', border: 'none', background: 'none', cursor: 'pointer',
                 color: 'var(--text-dim)'
               }}
               title="Close Editor Pane"
               onMouseEnter={(e) => {
                 e.currentTarget.style.color = 'var(--text-active)'
                 e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)'
               }}
               onMouseLeave={(e) => {
                 e.currentTarget.style.color = 'var(--text-dim)'
                 e.currentTarget.style.backgroundColor = 'transparent'
               }}
             >
               <X size={14} />
             </button>
           </div>
        </div>

        {/* Tab Bar UI - Below Breadcrumbs */}
        <div 
          className="no-scrollbar"
          style={{ 
            display: 'flex', overflowX: 'auto', height: 36, alignItems: 'center', 
            padding: '0 8px', gap: 4, backgroundColor: 'var(--bg-secondary)', 
            borderTop: '1px solid var(--border-inactive)' 
          }}
        >
          {editorPane.openFiles.map(path => {
            const relativePath = path.replace(editorPane.rootPath + '/', '')
            const status = gitStatus ? gitStatus[relativePath] : undefined
            const statusColor = status === 'M' ? '#FBC02D' : status === 'A' ? '#4CAF50' : status === '??' ? '#2196F3' : undefined

            return (
              <div 
                key={path}
                onClick={() => handleFileSelect(path)}
                style={{
                  display: 'flex', alignItems: 'center', height: '100%', gap: 8,
                  borderRight: '1px solid var(--border-inactive)', cursor: 'pointer', transition: 'colors 0.2s',
                  backgroundColor: editorPane.activeFilePath === path ? 'var(--bg-primary)' : 'transparent',
                  color: statusColor || (editorPane.activeFilePath === path ? 'var(--accent)' : 'var(--text-dim)'),
                  borderTop: editorPane.activeFilePath === path ? '2px solid var(--accent)' : 'none',
                  padding: '0 12px'
                }}
                onMouseEnter={(e) => {
                  if (editorPane.activeFilePath !== path) e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.03)'
                }}
                onMouseLeave={(e) => {
                  if (editorPane.activeFilePath !== path) e.currentTarget.style.backgroundColor = 'transparent'
                }}
              >
                <FileCode 
                  size={12} 
                  style={{ color: statusColor || (editorPane.activeFilePath === path ? 'var(--accent)' : 'var(--text-dim)') }} 
                />
                <span style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{path.split('/').pop()}</span>
                {status && (
                  <span style={{ fontSize: '9px', fontWeight: 'bold', opacity: 0.8 }}>{status}</span>
                )}
                {isDirty && editorPane.activeFilePath === path && (
                  <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'var(--accent)', flexShrink: 0 }} />
                )}
                <button 
                  onClick={(e) => { e.stopPropagation(); closeEditorFile(workspaceId, editorPaneId, path); }}
                  style={{
                    padding: 2, borderRadius: 4, transition: 'opacity 0.2s', border: 'none', background: 'none', cursor: 'pointer',
                    opacity: editorPane.activeFilePath === path ? 1 : 0
                  }}
                  title="Close Tab"
                >
                  <X size={12} />
                </button>
              </div>
            )
          })}
          {editorPane.openFiles.length === 0 && (
            <div style={{ padding: '0 12px', fontSize: 11, color: 'var(--text-dim)', fontStyle: 'italic' }}>No open files</div>
          )}
        </div>
      </div>

      {/* Main Content Split */}
      <div 
        style={{ flex: 1, overflow: 'hidden', backgroundColor: 'var(--bg-main)' }} 
        onMouseDown={(e) => e.stopPropagation()}
      >
        <Group orientation="horizontal">
          <Panel 
            defaultSize={editorPane.fileTreeWidth || 20} 
            minSize={10} 
            style={{ height: '100%', position: 'relative' }}
            onResize={(size) => updateEditorPaneLayout(workspaceId, editorPaneId, { fileTreeWidth: Number(size) })}
          >
            <FileTree workspaceId={workspaceId} rootPath={editorPane.rootPath} onFileSelect={handleFileSelect} />
          </Panel>
          
          <Separator 
            style={{ 
              width: 1, 
              backgroundColor: 'var(--border-inactive)', 
              zIndex: 10,
              cursor: 'col-resize',
              transition: 'all 0.2s'
            }} 
          />
          
          <Panel defaultSize={80} minSize={30} style={{ height: '100%', position: 'relative', backgroundColor: 'var(--bg-main)' }}>
            {editorPane.activeFilePath ? (
              isLoading ? (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
                  <div style={{ 
                    width: 16, height: 16, borderRadius: '50%', border: '2px solid var(--text-dim)', 
                    borderTopColor: 'var(--accent)', marginRight: 12, animation: 'spin 1s linear infinite' 
                  }} /> Loading file content...
                </div>
              ) : isImageFile(editorPane.activeFilePath) ? (
                <div style={{
                  position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', 
                  justifyContent: 'center', padding: 32, background: 'var(--bg-secondary)',
                  overflow: 'auto', backgroundImage: 'repeating-conic-gradient(#333 0% 25%, #444 0% 50%)',
                  backgroundSize: '20px 20px'
                }}>
                  <img 
                    src={convertFileSrc(editorPane.activeFilePath!)} 
                    alt="Preview" 
                    style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}
                  />
                </div>
              ) : isBinary ? (
                <div style={{
                  position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)',
                  backgroundColor: 'var(--bg-secondary)'
                }}>
                   <ImageIcon size={48} style={{ marginBottom: 16, opacity: 0.2 }} />
                   <p style={{ fontSize: 14 }}>The file is not displayed in the editor because it is either binary or uses an unsupported text encoding.</p>
                   <p style={{ fontSize: 12, opacity: 0.7, marginTop: 8, fontFamily: 'monospace', backgroundColor: 'var(--bg-primary)', padding: '4px 8px', borderRadius: 4 }}>{fileName}</p>
                </div>
              ) : (editorPane.activeFilePath && editorPane.activeFilePath.toLowerCase().endsWith('.md') && showPreview) ? (
                <MarkdownPreview content={fileContent} workspaceId={workspaceId} editorPaneId={editorPaneId} />
              ) : (
                <Editor
                  height="100%"
                  language={getLanguageFromPath(editorPane.activeFilePath)}
                  value={fileContent}
                  theme="termspace-dynamic"
                  onChange={handleEditorChange}
                  onMount={handleEditorDidMount}
                  options={{
                    minimap: { enabled: false },
                    fontSize: settings.fontSize || 14,
                    fontFamily: settings.terminalFontFamily || '"JetBrains Mono", "Fira Code", Menlo, monospace',
                    fontLigatures: true,
                    wordWrap: 'on',
                    scrollBeyondLastLine: false,
                    padding: { top: 16, bottom: 16 },
                    renderLineHighlight: 'all',
                    smoothScrolling: true,
                    cursorBlinking: 'smooth',
                  }}
                />
              )
            ) : (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)',
                backgroundColor: 'var(--bg-secondary)', opacity: 0.5
              }}>
                <FileCode size={48} style={{ marginBottom: 16, opacity: 0.5 }} />
                <p style={{ fontSize: 14 }}>Select a file to start editing</p>
              </div>
            )}
          </Panel>
        </Group>
      </div>

      {showConfirmDiscard && (
        <ConfirmModal
          title="Discard Changes"
          message={`Are you sure you want to discard unsaved changes to ${fileName}?`}
          confirmText="Discard"
          cancelText="Cancel"
          isDestructive={true}
          onConfirm={confirmDiscard}
          onCancel={() => setShowConfirmDiscard(null)}
        />
      )}
    </div>
  )
}

function getLanguageFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'ts':
      return 'typescript'
    case 'tsx':
      return 'typescriptreact'
    case 'js':
      return 'javascript'
    case 'jsx':
      return 'javascriptreact'
    case 'json':
      return 'json'
    case 'html':
      return 'html'
    case 'css':
      return 'css'
    case 'md':
      return 'markdown'
    case 'rs':
      return 'rust'
    case 'php':
      return 'php'
    case 'py':
      return 'python'
    case 'go':
      return 'go'
    case 'c':
    case 'cpp':
    case 'h':
    case 'hpp':
      return 'cpp'
    case 'java':
      return 'java'
    case 'sh':
    case 'bash':
      return 'shell'
    case 'yaml':
    case 'yml':
      return 'yaml'
    case 'xml':
      return 'xml'
    case 'sql':
      return 'sql'
    default:
      return 'plaintext'
  }
}
