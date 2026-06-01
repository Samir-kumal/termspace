import { LayoutNode, LayoutDirection } from '../types'

function generateId() {
  return Math.random().toString(36).substring(2, 9)
}

export function addTerminalToLayout(
  root: LayoutNode | null,
  terminalId: string,
  targetId?: string,
  direction: LayoutDirection = 'horizontal'
): LayoutNode {
  const newPane: LayoutNode = { type: 'pane', id: generateId(), terminalId }

  if (!root) {
    return newPane
  }

  // If no targetId, we just split the root.
  if (!targetId) {
    if (root.type === 'pane') {
      return {
        type: 'split',
        id: generateId(),
        direction,
        sizes: [50, 50],
        children: [root, newPane],
      }
    } else {
      // It's a split. Just add to it if it's the same direction, else wrap it?
      // Actually, standard is to split the root node.
      return {
        type: 'split',
        id: generateId(),
        direction,
        sizes: [50, 50],
        children: [root, newPane],
      }
    }
  }

  // Recursive function to find target and replace with split
  function traverseAndAdd(node: LayoutNode): LayoutNode {
    if (node.type === 'pane') {
      if (node.terminalId === targetId) {
        return {
          type: 'split',
          id: generateId(),
          direction,
          sizes: [50, 50],
          children: [node, newPane],
        }
      }
      return node
    }

    if (node.type === 'split') {
      return {
        ...node,
        children: node.children.map(traverseAndAdd)
      }
    }
    return node
  }

  return traverseAndAdd(root)
}

export function removeTerminalFromLayout(root: LayoutNode | null, terminalId: string): LayoutNode | null {
  if (!root) return null

  function traverseAndRemove(node: LayoutNode): LayoutNode | null {
    if (node.type === 'pane') {
      if (node.terminalId === terminalId) return null
      return node
    }

    if (node.type === 'split') {
      const newChildren = node.children.map(traverseAndRemove).filter(Boolean) as LayoutNode[]
      if (newChildren.length === 0) return null
      if (newChildren.length === 1) return newChildren[0] // Collapse split
      return { ...node, children: newChildren }
    }
    return node
  }

  return traverseAndRemove(root)
}

export function swapTerminalsInLayout(root: LayoutNode | null, sourceTerminalId: string, targetTerminalId: string): LayoutNode | null {
  if (!root) return null

  function traverseAndSwap(node: LayoutNode): LayoutNode {
    if (node.type === 'pane') {
      if (node.terminalId === sourceTerminalId) {
        return { ...node, terminalId: targetTerminalId }
      }
      if (node.terminalId === targetTerminalId) {
        return { ...node, terminalId: sourceTerminalId }
      }
      return node
    }
    if (node.type === 'split') {
      return { ...node, children: node.children.map(traverseAndSwap) }
    }
    return node
  }

  return traverseAndSwap(root)
}

export function updateSplitSizes(root: LayoutNode | null, splitId: string, sizes: number[]): LayoutNode | null {
  if (!root) return null

  function traverseAndUpdate(node: LayoutNode): LayoutNode {
    if (node.type === 'pane') return node
    if (node.type === 'split') {
      if (node.id === splitId) {
        return { ...node, sizes, children: node.children.map(traverseAndUpdate) }
      }
      return { ...node, children: node.children.map(traverseAndUpdate) }
    }
    return node
  }

  return traverseAndUpdate(root)
}
