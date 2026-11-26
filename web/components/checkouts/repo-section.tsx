import { Plus } from 'lucide-react'

import type {
  Checkout,
  RepoCheckouts,
  RunSummary,
} from '../../../core/types.ts'
import type { RunHereTarget } from '@/components/checkouts/run-here-dialog.tsx'
import { WorktreeRow } from '@/components/checkouts/worktree-row.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Tip } from '@/components/ui/tooltip.tsx'
import { visibleCheckouts } from '@/lib/checkout-order.ts'
import type {
  CheckoutFilters,
  CheckoutPref,
  CheckoutPrefs,
} from '@/lib/checkout-prefs.ts'

interface RepoSectionProps {
  repo: RepoCheckouts
  prefs: CheckoutPrefs
  filters: CheckoutFilters
  query: string // what the search box holds, matched against name and branch
  onPrefChange: (path: string, change: Partial<CheckoutPref>) => void
  latestRuns: Map<string, RunSummary> // by checkout path
  onRunHere: (target: RunHereTarget) => void
  onOpenRun: (id: string) => void
  onNewWorktree: () => void
  onRemove: (checkout: Checkout) => void
}

function matches(checkout: Checkout, pref: CheckoutPref, query: string) {
  if (query === '') return true
  const needle = query.toLowerCase()
  return [checkout.path.split('/').pop(), pref.nickname, checkout.branch].some(
    (text) => text?.toLowerCase().includes(needle),
  )
}

export function RepoSection({
  repo,
  prefs,
  filters,
  query,
  onPrefChange,
  latestRuns,
  onRunHere,
  onOpenRun,
  onNewWorktree,
  onRemove,
}: RepoSectionProps) {
  const shown = visibleCheckouts(repo.checkouts, prefs, filters).filter(
    (checkout) => matches(checkout, prefs[checkout.path] ?? {}, query),
  )
  const hidden = repo.checkouts.length - shown.length
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
        <div className="overflow-hidden rounded-xl border bg-card">
          {shown.length > 0 && (
            <ul className="divide-y">
              {shown.map((checkout) => (
                <WorktreeRow
                  key={checkout.path}
                  checkout={checkout}
                  mainline={repo.mainline}
                  pref={prefs[checkout.path] ?? {}}
                  onChange={(change) => onPrefChange(checkout.path, change)}
                  latestRun={latestRuns.get(checkout.path) ?? null}
                  onRunHere={() =>
                    onRunHere({ root: repo.root, checkout: checkout.path })
                  }
                  onOpenRun={onOpenRun}
                  onRemove={checkout.primary ? null : () => onRemove(checkout)}
                />
              ))}
            </ul>
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
