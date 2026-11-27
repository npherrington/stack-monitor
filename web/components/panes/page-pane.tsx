import { DropOverlay } from '@/components/panes/drop-overlay.tsx'
import { PaneSlot } from '@/components/panes/pane-slot.tsx'

interface PagePaneProps {
  dragging: string | null
}

// The routed page, scrolling inside its pane. The padding is the old <main>'s, which the PR view's
// sticky header counts on.
export function PagePane({ dragging }: PagePaneProps) {
  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <main
        data-pane-id="page"
        data-pane-kind="page"
        tabIndex={-1}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-6 outline-none md:px-8 md:py-8"
      >
        <div className="mx-auto max-w-6xl">
          <PaneSlot heldKey="page" fill={false} />
        </div>
      </main>
      {dragging !== null && (
        <DropOverlay paneId="page" pane={null} dragging={dragging} />
      )}
    </div>
  )
}
