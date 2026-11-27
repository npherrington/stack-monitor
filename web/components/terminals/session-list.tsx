import { PanelRightClose, PanelRightOpen, Terminal } from 'lucide-react'

import { Beaver } from '@/components/terminals/beaver.tsx'
import { swatchFill } from '@/components/ui/swatch-variants.ts'
import { Tip } from '@/components/ui/tooltip.tsx'
import { useTerminalLayout } from '@/contexts/terminal-context.ts'
import { findPane, placedSessions, terminalPanes } from '@/lib/pane-layout.ts'
import { sessionLabel } from '@/lib/session-label.ts'
import { cn } from '@/lib/utils.ts'

interface SessionListProps {
  collapsed: boolean // the sidebar is a rail of icons
}

// The sidebar's Sessions group: a row per terminal session, in the panes' order, that shows its tab;
// and the toggle that shows or hides the terminals beside the page. A narrow screen gets the
// toggle alone, in the bar across the top.
export function SessionList({ collapsed }: SessionListProps) {
  const { sessions, busy, layout, tabStyles, focusSession, setHidden } =
    useTerminalLayout()
  const hasPanes = terminalPanes(layout.root).length > 0
  const shown = hasPanes && !layout.terminalsHidden
  const running = sessions.filter((session) => session.exitCode === null).length
  const order = placedSessions(layout.root)
  const rows = sessions.toSorted(
    (a, b) => order.indexOf(a.id) - order.indexOf(b.id),
  )
  const current = shown ? findPane(layout.root, layout.focused)?.active : null
  const toggleLabel = shown ? 'Hide the terminals' : 'Show the terminals'
  const label = cn(collapsed && 'md:sr-only')

  const toggle = (
    <button
      type="button"
      aria-pressed={shown}
      disabled={!hasPanes}
      onClick={() => setHidden('terminals', shown)}
      className={cn(
        'relative flex items-center gap-1.5 rounded-md px-2 py-1 text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-strong focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
        collapsed && 'md:px-1.5',
      )}
    >
      {busy.size > 0 ? (
        <Beaver busy />
      ) : shown ? (
        <PanelRightClose className="size-4 shrink-0" aria-hidden="true" />
      ) : (
        <PanelRightOpen className="size-4 shrink-0" aria-hidden="true" />
      )}
      <span className="sr-only">{toggleLabel}</span>
      {running > 0 && (
        <span
          className={cn(
            'rounded-full bg-success/15 px-1.5 text-xs text-success tabular-nums',
            collapsed &&
              'md:absolute md:-top-1 md:-right-1 md:px-1 md:text-[10px] md:leading-4',
          )}
        >
          {running}
          <span className="sr-only"> running</span>
        </span>
      )}
    </button>
  )

  return (
    <section aria-labelledby="sessions-heading" className="flex flex-col gap-1">
      <div
        className={cn(
          'flex items-center justify-between gap-2 md:pl-2.5',
          collapsed && 'md:justify-center md:pl-0',
        )}
      >
        <h2
          id="sessions-heading"
          className={cn(
            'sr-only text-[11px] font-semibold tracking-wider text-muted-foreground uppercase md:not-sr-only',
            collapsed && 'md:sr-only',
          )}
        >
          Sessions
        </h2>
        <Tip label={toggleLabel} side="right">
          {toggle}
        </Tip>
      </div>
      <ul className="hidden flex-col gap-0.5 md:flex">
        {rows.length === 0 && !collapsed && (
          <li className="px-2.5 py-1 text-xs text-muted-foreground">
            None yet: click the beaver on a worktree.
          </li>
        )}
        {rows.map((session) => {
          const style = tabStyles[session.id] ?? {}
          const name = sessionLabel(session, style)
          const exited = session.exitCode !== null
          const working = busy.has(session.id)
          const row = (
            <button
              type="button"
              aria-current={session.id === current ? 'true' : undefined}
              onClick={() => focusSession(session.id)}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-strong focus-visible:ring-2 focus-visible:ring-ring',
                session.id === current && 'bg-muted text-strong',
                collapsed && 'md:justify-center md:px-0',
              )}
            >
              {session.kind === 'shell' ? (
                <Terminal
                  aria-hidden="true"
                  className={cn('size-4 shrink-0', exited && 'opacity-40')}
                />
              ) : (
                <Beaver
                  busy={working}
                  className={cn(exited && 'opacity-40 grayscale')}
                />
              )}
              <span className={cn('min-w-0 flex-1 truncate text-left', label)}>
                {name}
              </span>
              {style.colour !== undefined && !collapsed && (
                <span
                  aria-hidden="true"
                  className={cn(
                    swatchFill({ colour: style.colour }),
                    'size-2 shrink-0 rounded-full',
                  )}
                />
              )}
              {exited ? (
                <span className="sr-only">(exited)</span>
              ) : (
                working && <span className="sr-only">(working)</span>
              )}
            </button>
          )
          return (
            <li key={session.id} className="relative">
              {collapsed ? (
                <Tip label={name} side="right">
                  {row}
                </Tip>
              ) : (
                row
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
