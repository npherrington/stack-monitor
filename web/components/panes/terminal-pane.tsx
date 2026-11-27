import {
  ArrowDownToLine,
  ArrowLeftToLine,
  ArrowRightToLine,
  ArrowUpToLine,
  Ellipsis,
  Eye,
  EyeOff,
  PanelRightClose,
  Plus,
} from 'lucide-react'
import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from 'react'

import { DropOverlay } from '@/components/panes/drop-overlay.tsx'
import { PaneSlot } from '@/components/panes/pane-slot.tsx'
import { PaneTab } from '@/components/panes/pane-tab.tsx'
import { Button } from '@/components/ui/button.tsx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.tsx'
import { Tip } from '@/components/ui/tooltip.tsx'
import { useTerminalLayout } from '@/contexts/terminal-context.ts'
import {
  TAB_DRAG_TYPE,
  type Edge,
  type TerminalLeaf,
} from '@/lib/pane-layout.ts'

const PAGE_PLACES: { edge: Edge; label: string; icon: typeof Plus }[] = [
  { edge: 'left', label: 'Put the page left', icon: ArrowLeftToLine },
  { edge: 'right', label: 'Put the page right', icon: ArrowRightToLine },
  { edge: 'top', label: 'Put the page above', icon: ArrowUpToLine },
  { edge: 'bottom', label: 'Put the page below', icon: ArrowDownToLine },
]

// Where a tab dropped on the strip goes: before the first tab whose middle is right of the pointer.
function dropIndex(strip: HTMLElement, clientX: number): number {
  const tabs = [...strip.querySelectorAll<HTMLElement>('[data-tab]')]
  const at = tabs.findIndex((tab) => {
    const { left, width } = tab.getBoundingClientRect()
    return clientX < left + width / 2
  })
  return at === -1 ? tabs.length : at
}

// Arrow keys, Home and End move between a strip's tabs, as a tablist's do.
function roveTabs(event: KeyboardEvent<HTMLDivElement>): void {
  const tabs = [
    ...event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]'),
  ]
  const at = tabs.indexOf(document.activeElement as HTMLElement)
  if (at === -1) return
  const next =
    event.key === 'ArrowRight'
      ? (at + 1) % tabs.length
      : event.key === 'ArrowLeft'
        ? (at - 1 + tabs.length) % tabs.length
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? tabs.length - 1
            : null
  if (next === null) return
  event.preventDefault()
  tabs[next].focus()
}

interface TerminalPaneProps {
  pane: TerminalLeaf
  index: number // its place among the terminal panes, for its label
  dragging: string | null
  onDragChange: (session: string | null) => void
}

// A pane of terminals: its tab strip over the active tab's terminal.
export function TerminalPane({
  pane,
  index,
  dragging,
  onDragChange,
}: TerminalPaneProps) {
  const {
    sessions,
    layout,
    focusPane,
    focusSession,
    moveTab,
    openFor,
    movePage,
    setHidden,
  } = useTerminalLayout()
  const container = useRef<HTMLDivElement>(null)
  const [insertAt, setInsertAt] = useState<number | null>(null)
  const focused = layout.focused === pane.id
  const tabs = pane.tabs.flatMap((id) => {
    const session = sessions.find((each) => each.id === id)
    return session === undefined ? [] : [session]
  })
  const current = tabs.find((session) => session.id === pane.active)

  // The terminal is portalled in, so its focus and clicks reach this pane only through the DOM.
  useEffect(() => {
    const element = container.current
    if (element === null) return
    const claim = () => focusPane(pane.id)
    element.addEventListener('focusin', claim)
    element.addEventListener('pointerdown', claim)
    return () => {
      element.removeEventListener('focusin', claim)
      element.removeEventListener('pointerdown', claim)
    }
  }, [pane.id, focusPane])

  const overStrip = (event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes(TAB_DRAG_TYPE)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setInsertAt(dropIndex(event.currentTarget, event.clientX))
  }

  const dropOnStrip = (event: DragEvent<HTMLDivElement>) => {
    const session = event.dataTransfer.getData(TAB_DRAG_TYPE)
    setInsertAt(null)
    if (session === '') return
    event.preventDefault()
    moveTab(session, {
      pane: pane.id,
      index: dropIndex(event.currentTarget, event.clientX),
    })
  }

  return (
    <div
      ref={container}
      data-pane-id={pane.id}
      data-pane-kind="terminals"
      className="relative flex h-full min-h-0 flex-col bg-card"
    >
      {focused && (
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-0 z-10 h-0.5 bg-primary/70"
        />
      )}
      <div className="flex items-center gap-1 border-b px-2 py-1.5">
        <div
          role="tablist"
          tabIndex={-1}
          aria-label={`Terminals ${index + 1}`}
          onKeyDown={roveTabs}
          onDragOver={overStrip}
          onDragLeave={() => setInsertAt(null)}
          onDrop={dropOnStrip}
          className="relative flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto"
        >
          {tabs.map((session, at) => (
            <div key={session.id} className="relative flex shrink-0">
              {insertAt === at && <InsertBar />}
              <PaneTab
                session={session}
                paneId={pane.id}
                active={session.id === pane.active}
                paneFocused={focused}
                movable
                onSelect={() => focusSession(session.id)}
                onDragChange={onDragChange}
              />
            </div>
          ))}
          {insertAt === tabs.length && (
            <div className="relative h-6 w-1">
              <InsertBar />
            </div>
          )}
        </div>
        {current !== undefined && (
          <Tip label="New shell here">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="New shell here"
              onClick={() =>
                openFor({
                  root: current.root,
                  path: current.path,
                  kind: 'shell',
                })
              }
              className="text-muted-foreground"
            >
              <Plus />
            </Button>
          </Tip>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Pane options"
                className="text-muted-foreground"
              />
            }
          >
            <Ellipsis />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {PAGE_PLACES.map(({ edge, label, icon: Icon }) => (
              <DropdownMenuItem
                key={edge}
                onClick={() => movePage(pane.id, edge)}
              >
                <Icon />
                {label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => setHidden('page', !layout.pageHidden)}
            >
              {layout.pageHidden ? <Eye /> : <EyeOff />}
              {layout.pageHidden ? 'Show the page' : 'Hide the page'}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setHidden('terminals', true)}>
              <PanelRightClose />
              Hide the terminals
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div
        role="tabpanel"
        id={`panel-${pane.id}`}
        aria-labelledby={`tab-${pane.active}`}
        className="relative flex min-h-0 flex-1 flex-col"
      >
        <PaneSlot heldKey={pane.active} />
        {dragging !== null && (
          <DropOverlay paneId={pane.id} pane={pane} dragging={dragging} />
        )}
      </div>
    </div>
  )
}

function InsertBar() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 -left-0.5 w-0.5 rounded-full bg-primary"
    />
  )
}
