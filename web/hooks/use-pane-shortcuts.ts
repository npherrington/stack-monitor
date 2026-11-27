import { useEffect } from 'react'

import { useTerminalLayout } from '@/contexts/terminal-context.ts'
import { typingInField } from '@/lib/keys.ts'
import { findPane, neighbour, visibleTree } from '@/lib/pane-layout.ts'
import { paneCommand } from '@/lib/pane-shortcuts.ts'

// The pane a key was pressed in, by the DOM: a terminal's events reach the pane's element there,
// not through React.
function paneAt(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element
    ? target.closest<HTMLElement>('[data-pane-id]')
    : null
}

// Puts keyboard focus in a pane: its terminal, or the page's scroll container. The pane's own
// focusin listener then makes it the focused pane.
function focusPaneElement(id: string): void {
  const pane = document.querySelector<HTMLElement>(
    `[data-pane-id="${CSS.escape(id)}"]`,
  )
  const target =
    pane?.querySelector<HTMLElement>('textarea.xterm-helper-textarea') ?? pane
  target?.focus()
}

// ⌘D and ⌘⇧D split, ⌘W closes the tab, ⌘⌥ arrows move between panes and ⌘⇧[ ⌘⇧] cycle tabs
// (lib/pane-shortcuts.ts), in the terminal too. A key it runs is kept from the browser.
export function usePaneShortcuts(enabled: boolean): void {
  const { layout, split, close, cycleTab } = useTerminalLayout()

  useEffect(() => {
    if (!enabled) return
    const handleKey = (event: KeyboardEvent) => {
      const command = paneCommand(event)
      if (command === null || typingInField(event.target, false)) return
      const here = paneAt(event.target)
      const inTerminals = here?.dataset.paneKind === 'terminals'
      const pane = findPane(
        layout.root,
        inTerminals ? (here?.dataset.paneId ?? null) : layout.focused,
      )
      if (command.type === 'focus') {
        const from = here?.dataset.paneId ?? pane?.id ?? 'page'
        const to = neighbour(visibleTree(layout), from, command.edge)
        if (to === null) return
        event.preventDefault()
        focusPaneElement(to)
        return
      }
      if (pane === undefined) return
      if (command.type === 'close-tab' && !inTerminals) return
      event.preventDefault()
      if (command.type === 'split') split(pane.id, command.edge)
      else if (command.type === 'close-tab') close(pane.active)
      else cycleTab(pane.id, command.step)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [enabled, layout, split, close, cycleTab])
}
