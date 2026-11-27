import { PanelRightClose } from 'lucide-react'

import { PagePane } from '@/components/panes/page-pane.tsx'
import { PaneSlot } from '@/components/panes/pane-slot.tsx'
import { PaneTab } from '@/components/panes/pane-tab.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Tip } from '@/components/ui/tooltip.tsx'
import { useTerminalLayout } from '@/contexts/terminal-context.ts'
import {
  findPane,
  paneOf,
  placedSessions,
  terminalPanes,
} from '@/lib/pane-layout.ts'

// A narrow screen has no room for splits: the page fills it, and the terminals open over it as one
// strip of every session, showing the focused pane's tab.
export function NarrowPanes() {
  const { sessions, layout, focusSession, setHidden } = useTerminalLayout()
  const pane =
    findPane(layout.root, layout.focused) ?? terminalPanes(layout.root)[0]
  const shown = pane !== undefined && !layout.terminalsHidden
  const strip = placedSessions(layout.root).flatMap((id) => {
    const session = sessions.find((each) => each.id === id)
    return session === undefined ? [] : [session]
  })

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PagePane dragging={null} />
      {shown && (
        <section
          aria-label="Terminals"
          data-pane-id={pane.id}
          data-pane-kind="terminals"
          className="fixed inset-0 z-40 flex flex-col bg-card"
        >
          <div className="flex items-center gap-1 border-b px-2 py-1.5">
            <div
              role="tablist"
              aria-label="Terminals"
              className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto"
            >
              {strip.map((session) => (
                <PaneTab
                  key={session.id}
                  session={session}
                  paneId={paneOf(layout.root, session.id)?.id ?? pane.id}
                  active={session.id === pane.active}
                  paneFocused
                  movable={false}
                  onSelect={() => focusSession(session.id)}
                  onDragChange={() => undefined}
                />
              ))}
            </div>
            <Tip label="Hide the terminals">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Hide the terminals"
                onClick={() => setHidden('terminals', true)}
                className="text-muted-foreground"
              >
                <PanelRightClose />
              </Button>
            </Tip>
          </div>
          <div
            role="tabpanel"
            id={`panel-${pane.id}`}
            aria-labelledby={`tab-${pane.active}`}
            className="flex min-h-0 flex-1 flex-col"
          >
            <PaneSlot heldKey={pane.active} />
          </div>
        </section>
      )}
    </div>
  )
}
