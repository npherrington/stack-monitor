import { PanelRightClose, Plus, Terminal, X } from 'lucide-react'
import {
  lazy,
  Suspense,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'

import type { TerminalSession } from '../../../core/types.ts'
import { Beaver } from '@/components/terminals/beaver.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Tip } from '@/components/ui/tooltip.tsx'
import { useTerminalPanel } from '@/contexts/terminal-context.ts'
import { readPrefs } from '@/lib/checkout-prefs.ts'
import { cn } from '@/lib/utils.ts'

// xterm is most of a megabyte: it loads the first time a session shows.
const TerminalView = lazy(() =>
  import('@/components/terminals/terminal-view.tsx').then((module) => ({
    default: module.TerminalView,
  })),
)

const WIDTH_KEY = 'stack-monitor:terminal-width'
const MIN_WIDTH = 360
const DEFAULT_WIDTH = 640
const PAGE_MIN = 640 // what's left for the sidebar and the page beside it (40rem, as in its class)

function readWidth(): number {
  try {
    const stored = Number(localStorage.getItem(WIDTH_KEY))
    return stored >= MIN_WIDTH ? stored : DEFAULT_WIDTH
  } catch {
    return DEFAULT_WIDTH
  }
}

function label(session: TerminalSession): string {
  return (
    readPrefs()[session.path]?.nickname ??
    session.path.split('/').filter(Boolean).pop() ??
    session.path
  )
}

function widthAt(clientX: number): number {
  return Math.min(
    Math.max(window.innerWidth - clientX, MIN_WIDTH),
    window.innerWidth - PAGE_MIN,
  )
}

// Dragging the panel's left edge, which the next visit opens at too.
function dragWidth(
  start: ReactPointerEvent,
  setWidth: (width: number) => void,
): void {
  start.preventDefault()
  const move = (event: PointerEvent) => setWidth(widthAt(event.clientX))
  const stop = (event: PointerEvent) => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', stop)
    try {
      localStorage.setItem(WIDTH_KEY, String(widthAt(event.clientX)))
    } catch {
      // A convenience: without storage it opens at the default next time.
    }
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', stop)
}

// The Terminal panel beside the page: a tab per session, `claude` or a shell. Every session's terminal stays
// mounted while the panel is closed, so reopening it shows each one as it was.
export function TerminalPanel() {
  const { sessions, shown, setShown, active, setActive, openFor, close, busy } =
    useTerminalPanel()
  const [width, setWidth] = useState(readWidth)
  const current = sessions.find((session) => session.id === active)

  return (
    <aside
      aria-label="Terminal"
      style={{ '--panel-width': `${width}px` } as CSSProperties}
      className={cn(
        'fixed inset-0 z-40 flex flex-col bg-card md:relative md:inset-auto md:z-auto md:h-dvh md:w-[min(var(--panel-width),calc(100vw-40rem))] md:min-w-80 md:shrink-0 md:border-l md:sticky md:top-0',
        !shown && 'hidden md:hidden',
      )}
    >
      <div
        aria-hidden="true"
        onPointerDown={(event) => dragWidth(event, setWidth)}
        className="absolute inset-y-0 -left-1 z-10 hidden w-2 cursor-col-resize hover:bg-primary/30 md:block"
      />
      <div className="flex items-center gap-1 border-b px-2 py-1.5">
        <div
          role="tablist"
          aria-label="Sessions"
          className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto"
        >
          {sessions.map((session) => (
            <div
              key={session.id}
              className={cn(
                'group flex shrink-0 items-center rounded-md text-sm transition-colors',
                session.id === active
                  ? 'bg-muted text-strong'
                  : 'text-muted-foreground hover:bg-muted/60',
              )}
            >
              <button
                type="button"
                role="tab"
                aria-selected={session.id === active}
                title={session.path}
                onClick={() => setActive(session.id)}
                className="flex items-center gap-1.5 rounded-md py-1 pr-1 pl-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {session.kind === 'shell' ? (
                  <Terminal
                    aria-hidden="true"
                    className={cn(
                      'size-4 shrink-0',
                      session.exitCode !== null && 'opacity-40',
                    )}
                  />
                ) : (
                  <Beaver
                    busy={busy.has(session.id)}
                    className={cn(
                      session.exitCode !== null && 'opacity-40 grayscale',
                    )}
                  />
                )}
                <span className="max-w-40 truncate">{label(session)}</span>
                {session.exitCode !== null ? (
                  <span className="sr-only">(exited)</span>
                ) : (
                  busy.has(session.id) && (
                    <span className="sr-only">(working)</span>
                  )
                )}
              </button>
              <Tip label="End this session">
                <button
                  type="button"
                  aria-label={`End the session in ${label(session)}`}
                  onClick={() => close(session.id)}
                  className="mr-1 rounded p-0.5 opacity-60 outline-none hover:bg-background hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="size-3.5" />
                </button>
              </Tip>
            </div>
          ))}
        </div>
        {current !== undefined && (
          <Tip label={`New terminal in ${label(current)}`}>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`New terminal in ${label(current)}`}
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
        <Tip label="Hide the terminal">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Hide the terminal"
            onClick={() => setShown(false)}
            className="text-muted-foreground"
          >
            <PanelRightClose />
          </Button>
        </Tip>
      </div>
      {sessions.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
          <Terminal className="size-6" aria-hidden="true" />
          <p>
            Click{' '}
            <Terminal
              className="inline size-4 align-text-bottom"
              aria-label="the terminal icon"
            />{' '}
            on a worktree to open Claude Code in it, or pick Open a terminal
            here from its ⋯ menu for a shell.
          </p>
        </div>
      ) : (
        <Suspense fallback={<div className="flex-1" />}>
          {sessions.map((session) => (
            <TerminalView
              key={session.id}
              id={session.id}
              kind={session.kind}
              visible={shown && session.id === active}
            />
          ))}
        </Suspense>
      )}
    </aside>
  )
}
