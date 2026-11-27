import { useState, type DragEvent } from 'react'

import { useTerminalLayout } from '@/contexts/terminal-context.ts'
import {
  dropZone,
  type DropZone,
  type TerminalLeaf,
} from '@/lib/pane-layout.ts'
import { cn } from '@/lib/utils.ts'

const ZONE_CLASSES: Record<DropZone, string> = {
  left: 'inset-y-0 left-0 w-1/2',
  right: 'inset-y-0 right-0 w-1/2',
  top: 'inset-x-0 top-0 h-1/2',
  bottom: 'inset-x-0 bottom-0 h-1/2',
  centre: 'inset-0',
}

interface DropOverlayProps {
  paneId: string
  pane: TerminalLeaf | null // null for the page, which takes edges only
  dragging: string // the session id of the tab being dragged
}

// Over a pane's body while a tab is dragged, so the drag isn't lost to the terminal or the page
// under it. An edge splits the pane; the centre moves the tab into it.
export function DropOverlay({ paneId, pane, dragging }: DropOverlayProps) {
  const { moveTab } = useTerminalLayout()
  const [zone, setZone] = useState<DropZone | null>(null)

  const zoneAt = (event: DragEvent<HTMLDivElement>): DropZone | null => {
    const found = dropZone(event.currentTarget.getBoundingClientRect(), {
      x: event.clientX,
      y: event.clientY,
    })
    if (found !== 'centre') return found
    return pane !== null && !pane.tabs.includes(dragging) ? 'centre' : null
  }

  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 z-20"
      onDragOver={(event) => {
        const next = zoneAt(event)
        setZone(next)
        if (next === null) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
      }}
      onDragLeave={() => setZone(null)}
      onDrop={(event) => {
        const at = zoneAt(event)
        setZone(null)
        if (at === null) return
        event.preventDefault()
        if (at === 'centre' && pane !== null)
          moveTab(dragging, { pane: pane.id, index: pane.tabs.length })
        else if (at !== 'centre')
          moveTab(dragging, { beside: paneId, edge: at })
      }}
    >
      {zone !== null && (
        <div
          className={cn(
            'pointer-events-none absolute rounded-md border-2 border-primary/60 bg-primary/15',
            ZONE_CLASSES[zone],
          )}
        />
      )}
    </div>
  )
}
