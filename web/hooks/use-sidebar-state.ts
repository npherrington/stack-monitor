import { useCallback, useEffect, useMemo, useState } from 'react'

import { typingInField } from '@/lib/keys.ts'

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
      if (
        !(event.metaKey || event.ctrlKey) ||
        typingInField(event.target, true)
      )
        return
      event.preventDefault()
      toggle()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [toggle])

  return useMemo(() => ({ collapsed, toggle }), [collapsed, toggle])
}
