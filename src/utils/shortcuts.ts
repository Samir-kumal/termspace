export function matchShortcut(e: KeyboardEvent, shortcutStr: string): boolean {
  if (!shortcutStr) return false

  const parts = shortcutStr.toLowerCase().split('+').map(p => p.trim())
  
  const needsCtrlOrCmd = parts.includes('cmdorctrl')
  const needsShift = parts.includes('shift')
  const needsAlt = parts.includes('alt')
  
  // The actual key is the last part
  const keyPart = parts[parts.length - 1]

  const hasCtrlOrCmd = e.ctrlKey || e.metaKey
  
  if (needsCtrlOrCmd !== hasCtrlOrCmd) return false
  if (needsShift !== e.shiftKey) return false
  if (needsAlt !== e.altKey) return false

  return e.key.toLowerCase() === keyPart
}
