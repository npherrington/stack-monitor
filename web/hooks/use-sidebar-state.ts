import { useCallback, useEffect, useMemo, useState } from 'react'

const COLLAPSED_KEY = 'stack-monitor:sidebar-collapsed'

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

function storeCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0')
  } catch {
    // A convenience: without storage the sidebar opens wide next time.
  }
}

// Keys typed into a field, or into the terminal (xterm reads them through a hidden textarea).
function typing(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.closest('input, textarea, select, .xterm') !== null)
  )
}

interface UseSidebarStateResult {
  collapsed: boolean // shown as a rail of icons, on screens wide enough for a sidebar
  toggle: () => void
}

// Whether the sidebar is collapsed, kept per browser; ⌘B or Ctrl+B toggles it outside a field.
export function useSidebarState(): UseSidebarStateResult {
  const [collapsed, setCollapsed] = useState(readCollapsed)

  const toggle = useCallback(() => setCollapsed((current) => !current), [])

  useEffect(() => storeCollapsed(collapsed), [collapsed])

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'b' || event.shiftKey || event.altKey)
        return
      if (!(event.metaKey || event.ctrlKey) || typing(event.target)) return
      event.preventDefault()
      toggle()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [toggle])

  return useMemo(() => ({ collapsed, toggle }), [collapsed, toggle])
}
