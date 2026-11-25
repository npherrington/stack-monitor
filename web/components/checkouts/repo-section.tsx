import { Plus } from 'lucide-react'

import type { RepoCheckouts, RunSummary } from '../../../core/types.ts'
import { CheckoutCard } from '@/components/checkouts/checkout-card.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Pill } from '@/components/ui/pill.tsx'
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
  onPrefChange: (path: string, change: Partial<CheckoutPref>) => void
  latestRuns: Map<string, RunSummary> // by checkout path
  onRunHere: (checkout: string) => void
  onOpenRun: (id: string) => void
  onNewWorktree: () => void
}

export function RepoSection({
  repo,
  prefs,
  filters,
  onPrefChange,
  latestRuns,
  onRunHere,
  onOpenRun,
  onNewWorktree,
}: RepoSectionProps) {
  const shown = visibleCheckouts(repo.checkouts, prefs, filters)
  const hidden = repo.checkouts.length - shown.length
  return (
    <section
      aria-labelledby={`repo-${repo.root}`}
      className="flex flex-col gap-3"
    >
      <header className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-baseline gap-3">
            <h2
              id={`repo-${repo.root}`}
              className="text-xl font-extrabold text-strong"
            >
              {repo.name}
            </h2>
            <Pill>
              {repo.checkouts.length}{' '}
              {repo.checkouts.length === 1 ? 'checkout' : 'checkouts'}
            </Pill>
          </div>
          <span
            className="truncate font-mono text-xs text-muted-foreground"
            title={repo.root}
          >
            {repo.root}
          </span>
        </div>
        {repo.problem === null && (
          <Button size="sm" variant="outline" onClick={onNewWorktree}>
            <Plus aria-hidden />
            New worktree
          </Button>
        )}
      </header>
      {repo.problem !== null ? (
        <p className="text-sm text-destructive" role="alert">
          {repo.problem}
        </p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((checkout) => (
              <CheckoutCard
                key={checkout.path}
                checkout={checkout}
                mainline={repo.mainline}
                pref={prefs[checkout.path] ?? {}}
                onChange={(change) => onPrefChange(checkout.path, change)}
                latestRun={latestRuns.get(checkout.path) ?? null}
                onRunHere={() => onRunHere(checkout.path)}
                onOpenRun={onOpenRun}
              />
            ))}
          </div>
          {hidden > 0 && (
            <p className="text-sm text-muted-foreground">
              {hidden} hidden by the filters.
            </p>
          )}
        </>
      )}
    </section>
  )
}
