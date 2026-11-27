import { DropOverlay } from '@/components/panes/drop-overlay.tsx'
import { PaneSlot } from '@/components/panes/pane-slot.tsx'

interface PagePaneProps {
  dragging: string | null
}

// The routed page, scrolling inside its pane. The vertical padding is inside the scroller, not on
// it, so a sticky child's `top-0` is the pane's top edge (the PR view's bar).
export function PagePane({ dragging }: PagePaneProps) {
  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <main
        data-pane-id="page"
        data-pane-kind="page"
        tabIndex={-1}
        className="min-h-0 flex-1 overflow-y-auto px-4 outline-none md:px-8"
      >
        <div className="mx-auto max-w-6xl py-6 md:py-8">
          <PaneSlot heldKey="page" fill={false} />
        </div>
      </main>
      {dragging !== null && (
        <DropOverlay paneId="page" pane={null} dragging={dragging} />
      )}
    </div>
  )
}
