import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { ChevronRight, ChevronDown, File, Folder, FileJson, FileText, FileCode, Image, FileType, FileTerminal, FileArchive, Settings } from 'lucide-react'
import { FileNode, fetchDirectoryTree } from '../utils/fs'
import { useAppStore } from '../store/useAppStore'

interface FileTreeProps {
  workspaceId: string
  rootPath: string
  onFileSelect: (path: string) => void
}

interface FlatNode {
  path: string
  name: string
  depth: number
  isDirectory: boolean
  isOpen: boolean
  isLoading: boolean
  status?: string
}

const getStatusColor = (status?: string) => {
  switch (status) {
    case 'M': return '#FBC02D' // Modified - yellow
    case 'A': return '#4CAF50' // Added - green
    case 'D': return '#F44336' // Deleted - red
    case '??': return '#2196F3' // Untracked - blue
    default: return undefined
  }
}

const getIconForFile = (filename: string) => {
  const ext = filename.split('.').pop()?.toLowerCase()
  const name = filename.toLowerCase()

  if (name === 'package.json' || name === 'tsconfig.json') return <FileJson size={14} color="#FBC02D" />
  if (name.includes('config') || name.includes('settings')) return <Settings size={14} color="#607D8B" />
  if (name.startsWith('.')) return <Settings size={14} color="#9E9E9E" />

  switch (ext) {
    case 'ts':
    case 'tsx': return <FileType size={14} color="#0288D1" />
    case 'js':
    case 'jsx': return <FileCode size={14} color="#FDD835" />
    case 'html': return <FileCode size={14} color="#E65100" />
    case 'css': return <FileCode size={14} color="#0277BD" />
    case 'json': return <FileJson size={14} color="#FBC02D" />
    case 'md': return <FileText size={14} color="#000000" style={{ fill: '#B0BEC5' }} />
    case 'rs': return <FileCode size={14} color="#FF5722" />
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'svg':
    case 'ico': return <Image size={14} color="#4DB6AC" />
    case 'sh':
    case 'bash': return <FileTerminal size={14} color="#4CAF50" />
    case 'zip':
    case 'tar':
    case 'gz': return <FileArchive size={14} color="#F44336" />
    default: return <File size={14} color="#90A4AE" />
  }
}

const flattenNodes = (
  nodes: FileNode[],
  depth: number,
  expandedPaths: Set<string>,
  loadedChildren: Record<string, FileNode[]>,
  loadingPaths: Set<string>,
  gitStatus: Record<string, string> | undefined,
  rootPath: string
): FlatNode[] => {
  let result: FlatNode[] = []
  for (const node of nodes) {
    const isOpen = expandedPaths.has(node.path)
    const isLoading = loadingPaths.has(node.path)
    const relativePath = node.path.replace(rootPath + '/', '')
    
    result.push({
      path: node.path,
      name: node.name,
      depth,
      isDirectory: node.isDirectory,
      isOpen,
      isLoading,
      status: gitStatus ? gitStatus[relativePath] : undefined
    })

    if (node.isDirectory && isOpen && loadedChildren[node.path]) {
      result = result.concat(
        flattenNodes(
          loadedChildren[node.path],
          depth + 1,
          expandedPaths,
          loadedChildren,
          loadingPaths,
          gitStatus,
          rootPath
        )
      )
    }
  }
  return result
}

const ITEM_HEIGHT = 28 // Approximate height of each row

const TreeNode = React.memo<{
  node: FlatNode
  isFocused: boolean
  isSelected: boolean
  onToggle: (node: FlatNode) => void
  onFocus: (node: FlatNode) => void
  style?: React.CSSProperties
}>(({ node, isFocused, isSelected, onToggle, onFocus, style }) => {
  const [isHovered, setIsHovered] = React.useState(false)
  const statusColor = getStatusColor(node.status)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isFocused && ref.current && typeof ref.current.scrollIntoView === 'function') {
      ref.current.scrollIntoView({ block: 'nearest' })
    }
  }, [isFocused])

  return (
    <div 
      ref={ref}
      role="treeitem"
      aria-expanded={node.isDirectory ? node.isOpen : undefined}
      aria-selected={isSelected}
      tabIndex={isFocused ? 0 : -1}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => {
        onFocus(node)
        onToggle(node)
      }}
      style={{ 
        display: 'flex',
        alignItems: 'center',
        paddingRight: '8px',
        paddingLeft: `${node.depth * 14 + 12}px`,
        cursor: 'pointer',
        backgroundColor: isFocused || isHovered ? 'var(--bg-item-active)' : 'transparent',
        transition: 'background-color 0.1s ease',
        userSelect: 'none',
        position: 'absolute',
        left: 0,
        right: 0,
        height: ITEM_HEIGHT,
        outline: 'none',
        ...style
      }}
    >
      <div 
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: '2px',
          backgroundColor: isSelected ? 'var(--accent)' : 'var(--border-active)',
          transition: 'opacity 0.1s ease',
          opacity: isSelected || isFocused || isHovered ? 1 : 0
        }} 
      />
      
      <span 
        style={{ 
          marginRight: '6px', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          width: 16,
          color: isHovered ? 'var(--text-active)' : 'var(--text-inactive)',
          transition: 'color 0.15s ease'
        }}
      >
        {node.isDirectory ? (
          node.isLoading ? (
            <div 
              style={{ 
                width: '10px', 
                height: '10px', 
                borderRadius: '50%', 
                border: '1px solid var(--text-dim)', 
                borderTopColor: 'transparent', 
                animation: 'spin 1s linear infinite'
              }} 
            />
          ) : (
            node.isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />
          )
        ) : (
           getIconForFile(node.name)
        )}
      </span>
      
      {node.isDirectory && (
        <span style={{ marginRight: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#90A4AE' }}>
          <Folder size={14} fill={node.isOpen ? "#90A4AE" : "transparent"} />
        </span>
      )}

      <span 
        style={{ 
          fontSize: '13px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          letterSpacing: '0.025em',
          fontFamily: 'Inter, system-ui, sans-serif',
          color: statusColor || (node.isDirectory ? 'var(--text-active)' : (isHovered ? 'var(--text-active)' : 'var(--text-inactive)')),
          transition: 'color 0.15s ease'
        }}
      >
        {node.name}
      </span>
      
      {node.status && (
        <span style={{ 
          marginLeft: 'auto', 
          fontSize: '10px', 
          fontWeight: 'bold', 
          color: statusColor,
          opacity: 0.8
        }}>
          {node.status}
        </span>
      )}
    </div>
  )
})

export const FileTree: React.FC<FileTreeProps> = ({ workspaceId, rootPath, onFileSelect }) => {
  const [rootNodes, setRootNodes] = useState<FileNode[]>([])
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
  const [loadedChildren, setLoadedChildren] = useState<Record<string, FileNode[]>>({})
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set())
  const [isLoadingRoot, setIsLoadingRoot] = useState(true)
  const [focusedPath, setFocusedPath] = useState<string | null>(null)
  
  const [scrollTop, setScrollTop] = useState(0)
  const [containerHeight, setContainerHeight] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const gitStatus = useAppStore(s => s.gitStatusByWorkspace[workspaceId])
  const activeFile = useAppStore(s => s.activeFileByWorkspace[workspaceId])

  useEffect(() => {
    if (activeFile && !focusedPath) {
      setFocusedPath(activeFile)
    }
  }, [activeFile])

  useEffect(() => {
    const loadRoot = async () => {
      setIsLoadingRoot(true)
      const nodes = await fetchDirectoryTree(rootPath)
      setRootNodes(nodes)
      setIsLoadingRoot(false)
    }
    loadRoot()
  }, [rootPath])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleScroll = () => {
      setScrollTop(container.scrollTop)
    }

    const handleResize = () => {
      setContainerHeight(container.offsetHeight)
    }

    container.addEventListener('scroll', handleScroll)
    window.addEventListener('resize', handleResize)
    
    // Initial height
    setContainerHeight(container.offsetHeight)

    return () => {
      container.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  const handleToggle = useCallback(async (node: FlatNode) => {
    if (!node.isDirectory) {
      onFileSelect(node.path)
      setFocusedPath(node.path)
      return
    }

    if (!node.isOpen) {
      // Expanding
      setExpandedPaths(prev => new Set(prev).add(node.path))
      
      if (!loadedChildren[node.path]) {
        setLoadingPaths(prev => new Set(prev).add(node.path))
        try {
          const children = await fetchDirectoryTree(node.path)
          setLoadedChildren(prev => ({ ...prev, [node.path]: children }))
        } finally {
          setLoadingPaths(prev => {
            const next = new Set(prev)
            next.delete(node.path)
            return next
          })
        }
      }
    } else {
      // Collapsing
      setExpandedPaths(prev => {
        const next = new Set(prev)
        next.delete(node.path)
        return next
      })
    }
  }, [loadedChildren, onFileSelect])

  const flatNodes = useMemo(() => {
    return flattenNodes(
      rootNodes,
      0,
      expandedPaths,
      loadedChildren,
      loadingPaths,
      gitStatus,
      rootPath
    )
  }, [rootNodes, expandedPaths, loadedChildren, loadingPaths, gitStatus, rootPath])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (flatNodes.length === 0) return

    const currentIndex = flatNodes.findIndex(n => n.path === focusedPath)
    const currentNode = currentIndex >= 0 ? flatNodes[currentIndex] : null

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        const nextIndex = Math.min(flatNodes.length - 1, currentIndex + 1)
        setFocusedPath(flatNodes[nextIndex].path)
        break
      case 'ArrowUp':
        e.preventDefault()
        const prevIndex = Math.max(0, currentIndex - 1)
        setFocusedPath(flatNodes[prevIndex].path)
        break
      case 'ArrowRight':
        e.preventDefault()
        if (currentNode?.isDirectory) {
          if (!currentNode.isOpen) {
            handleToggle(currentNode)
          } else if (currentIndex + 1 < flatNodes.length) {
            setFocusedPath(flatNodes[currentIndex + 1].path)
          }
        }
        break
      case 'ArrowLeft':
        e.preventDefault()
        if (currentNode?.isDirectory && currentNode.isOpen) {
          handleToggle(currentNode)
        } else if (currentIndex >= 0) {
          // Move to parent
          const parentDepth = currentNode ? currentNode.depth - 1 : -1
          if (parentDepth >= 0) {
            for (let i = currentIndex - 1; i >= 0; i--) {
              if (flatNodes[i].depth === parentDepth) {
                setFocusedPath(flatNodes[i].path)
                break
              }
            }
          }
        }
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        if (currentNode) {
          handleToggle(currentNode)
        }
        break
    }
  }, [flatNodes, focusedPath, handleToggle])

  const BUFFER = 10
  const visibleNodes = useMemo(() => {
    const startIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - BUFFER)
    const endIndex = Math.min(flatNodes.length, Math.ceil((scrollTop + containerHeight) / ITEM_HEIGHT) + BUFFER)
    
    return flatNodes.slice(startIndex, endIndex).map((node, index) => ({
      node,
      index: startIndex + index
    }))
  }, [flatNodes, scrollTop, containerHeight])

  const folderName = rootPath.split('/').pop() || 'Workspace'

  return (
    <div 
      style={{
        position: 'absolute',
        inset: 0,
        backgroundColor: 'var(--bg-sidebar)',
        borderRight: '1px solid var(--border-inactive)',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <div 
        style={{
          paddingLeft: '16px',
          paddingRight: '16px',
          paddingTop: '12px',
          paddingBottom: '12px',
          backgroundColor: 'var(--bg-sidebar)',
          zIndex: 10,
          borderBottom: '1px solid var(--border-inactive)'
        }}
      >
        <div 
          style={{
            fontSize: '10px',
            fontWeight: 'bold',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'var(--text-dim)',
            marginBottom: '4px'
          }}
        >
          Explorer
        </div>
        <div 
          style={{
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--text-active)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center'
          }}
        >
          <Folder size={14} style={{ marginRight: '6px', color: 'var(--accent)' }} /> {folderName}
        </div>
      </div>
      
      <div 
        ref={containerRef}
        role="tree"
        aria-label="File Explorer"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        style={{ 
          flex: 1, 
          minHeight: 0,
          overflowY: 'auto', 
          position: 'relative',
          outline: 'none'
        }}
      >
        {isLoadingRoot ? (
          <div 
            style={{ 
              paddingLeft: '16px', 
              paddingRight: '16px', 
              paddingTop: '8px', 
              paddingBottom: '8px', 
              fontSize: '12px', 
              color: 'var(--text-dim)', 
              display: 'flex', 
              alignItems: 'center' 
            }}
          >
            <div 
              style={{ 
                width: '12px', 
                height: '12px', 
                borderRadius: '50%', 
                border: '2px solid var(--text-dim)', 
                borderTopColor: 'var(--accent)', 
                marginRight: '8px',
                animation: 'spin 1s linear infinite'
              }} 
            /> Scanning...
          </div>
        ) : rootNodes.length === 0 ? (
          <div style={{ paddingLeft: '16px', paddingRight: '16px', paddingTop: '8px', paddingBottom: '8px', fontSize: '12px', color: 'var(--text-dim)' }}>
            Folder is empty
          </div>
        ) : (
          <div style={{ height: flatNodes.length * ITEM_HEIGHT, position: 'relative' }}>
            {visibleNodes.map(({ node, index }) => (
              <TreeNode 
                key={node.path} 
                node={node} 
                isFocused={focusedPath === node.path}
                isSelected={activeFile === node.path}
                onToggle={handleToggle}
                onFocus={(n) => setFocusedPath(n.path)}
                style={{ top: index * ITEM_HEIGHT }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

