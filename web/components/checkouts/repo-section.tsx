import { Plus } from 'lucide-react'

import type {
  Checkout,
  RepoCheckouts,
  RunSummary,
} from '../../../core/types.ts'
import type { RunHereTarget } from '@/components/checkouts/run-here-dialog.tsx'
import {
  WorktreeRow,
  type TerminalState,
} from '@/components/checkouts/worktree-row.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Tip } from '@/components/ui/tooltip.tsx'
import { usePulls } from '@/hooks/use-pulls.ts'
import {
  useTerminalLayout,
  type TerminalContextValue,
} from '@/contexts/terminal-context.ts'
import { useRowDrag } from '@/hooks/use-row-drag.ts'
import { moveCheckout, visibleCheckouts } from '@/lib/checkout-order.ts'
import type {
  CheckoutFilters,
  CheckoutPref,
  CheckoutPrefs,
} from '@/lib/checkout-prefs.ts'
import { pullPath } from '@/lib/github-links.ts'
import type { Place } from '@/lib/row-order.ts'

interface RepoSectionProps {
  repo: RepoCheckouts
  prefs: CheckoutPrefs
  filters: CheckoutFilters
  query: string // what the search box holds, matched against name and branch
  onPrefChange: (path: string, change: Partial<CheckoutPref>) => void
  onReorder: (ranks: Record<string, number>) => void // after a row is moved
  latestRuns: Map<string, RunSummary> // by checkout path
  onRunHere: (target: RunHereTarget) => void
  onOpenRun: (id: string) => void
  onNewWorktree: () => void
  onRemove: (checkout: Checkout) => void
}

// Whether a worktree has a running `claude` session, and whether it's working.
function terminalState(
  { sessions, busy }: TerminalContextValue,
  path: string,
): TerminalState {
  const session = sessions.find(
    (each) =>
      each.kind === 'claude' && each.path === path && each.exitCode === null,
  )
  if (session === undefined) return 'none'
  return busy.has(session.id) ? 'busy' : 'open'
}

function matches(checkout: Checkout, pref: CheckoutPref, query: string) {
  if (query === '') return true
  const needle = query.toLowerCase()
  return [checkout.path.split('/').pop(), pref.nickname, checkout.branch].some(
    (text) => text?.toLowerCase().includes(needle),
  )
}

function pullLink(
  root: string,
  checkout: Checkout,
  pullOf: Map<string, number>,
): { number: number; to: string } | null {
  const number =
    checkout.branch === null ? undefined : pullOf.get(checkout.branch)
  return number === undefined ? null : { number, to: pullPath(root, number) }
}

export function RepoSection({
  repo,
  prefs,
  filters,
  query,
  onPrefChange,
  onReorder,
  latestRuns,
  onRunHere,
  onOpenRun,
  onNewWorktree,
  onRemove,
}: RepoSectionProps) {
  // A fork's branch can share a name with one here, so only the repo's own PRs count.
  const { list: pulls } = usePulls(repo.root)
  const pullOf = new Map(
    (pulls?.pulls ?? [])
      .filter((pull) => !pull.crossRepository)
      .map((pull) => [pull.branch, pull.number]),
  )
  const shown = visibleCheckouts(repo.checkouts, prefs, filters).filter(
    (checkout) => matches(checkout, prefs[checkout.path] ?? {}, query),
  )
  const hidden = repo.checkouts.length - shown.length
  const terminals = useTerminalLayout()
  const move = (path: string, target: string, place: Place) => {
    const ranks = moveCheckout(repo.checkouts, prefs, path, target, place)
    if (ranks !== null) onReorder(ranks)
  }
  // The row next to this one in the list, while it's in the same pinned group.
  const beside = (index: number, step: number) => {
    const other = shown[index + step]
    return other !== undefined &&
      Boolean(prefs[other.path]?.pinned) ===
        Boolean(prefs[shown[index].path]?.pinned)
      ? other
      : undefined
  }

  const moveBy = (index: number, step: number) => {
    const other = beside(index, step)
    return other === undefined
      ? null
      : () => move(shown[index].path, other.path, step < 0 ? 'before' : 'after')
  }

  const drag = useRowDrag({
    canMove: (path, target, place) =>
      moveCheckout(repo.checkouts, prefs, path, target, place) !== null,
    onMove: move,
  })

  return (
    <section
      aria-labelledby={`repo-${repo.root}`}
      className="flex flex-col gap-2"
    >
      <header className="flex items-center gap-2 px-1">
        <h2
          id={`repo-${repo.root}`}
          className="text-sm font-semibold text-strong"
          title={repo.root}
        >
          {repo.name}
        </h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          {repo.checkouts.length}
        </span>
        {repo.problem === null && (
          <Tip label={`New worktree in ${repo.name}`}>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`New worktree in ${repo.name}`}
              onClick={onNewWorktree}
              className="ml-auto text-muted-foreground"
            >
              <Plus />
            </Button>
          </Tip>
        )}
      </header>
      {repo.problem !== null ? (
        <p
          className="rounded-xl border bg-card px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {repo.problem}
        </p>
      ) : (
        <div
          className="@container relative overflow-hidden rounded-xl border bg-card"
          {...drag.handlers}
        >
          {shown.length > 0 && (
            <ul className="divide-y">
              {shown.map((checkout, index) => (
                <WorktreeRow
                  key={checkout.path}
                  checkout={checkout}
                  mainline={repo.mainline}
                  pull={pullLink(repo.root, checkout, pullOf)}
                  pref={prefs[checkout.path] ?? {}}
                  onChange={(change) => onPrefChange(checkout.path, change)}
                  latestRun={latestRuns.get(checkout.path) ?? null}
                  onRunHere={() =>
                    onRunHere({ root: repo.root, checkout: checkout.path })
                  }
                  onOpenRun={onOpenRun}
                  terminal={terminalState(terminals, checkout.path)}
                  onOpenTerminal={() =>
                    terminals.openFor({ root: repo.root, path: checkout.path })
                  }
                  onOpenShell={() =>
                    terminals.openFor({
                      root: repo.root,
                      path: checkout.path,
                      kind: 'shell',
                    })
                  }
                  onRemove={checkout.primary ? null : () => onRemove(checkout)}
                  onMoveUp={moveBy(index, -1)}
                  onMoveDown={moveBy(index, 1)}
                />
              ))}
            </ul>
          )}
          {drag.dropTop !== null && (
            <div
              aria-hidden="true"
              style={{ top: drag.dropTop - 1 }}
              className="pointer-events-none absolute inset-x-2 h-0.5 rounded-full bg-primary"
            />
          )}
          {hidden > 0 && (
            <p
              className={
                shown.length > 0
                  ? 'border-t px-4 py-2 text-xs text-muted-foreground'
                  : 'px-4 py-3 text-xs text-muted-foreground'
              }
            >
              {hidden} hidden by the search or filters
            </p>
          )}
        </div>
      )}
    </section>
  )
}
