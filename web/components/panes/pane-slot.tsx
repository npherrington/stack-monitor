import { useLayoutEffect, useRef } from 'react'

import { held } from '@/lib/held-elements.ts'

interface PaneSlotProps {
  heldKey: string // 'page', or a session id
  fill?: boolean // a terminal fills the pane; the page flows as a document
}

// Where a pane shows the page or a terminal: it adopts that held element rather than rendering it,
// so the element moves between panes with its state (lib/held-elements.ts).
export function PaneSlot({ heldKey, fill = true }: PaneSlotProps) {
  const slot = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const container = slot.current
    if (container === null) return
    const element = held(heldKey)
    container.append(element)
    return () => {
      // Another slot may have adopted it in the same commit.
      if (element.parentElement === container) element.remove()
    }
  }, [heldKey])
  return (
    <div
      ref={slot}
      className={fill ? 'flex min-h-0 flex-1 flex-col' : undefined}
    />
  )
}
