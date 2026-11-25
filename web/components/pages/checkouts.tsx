import { Link } from 'react-router'

import { CheckoutFilters } from '@/components/checkouts/checkout-filters.tsx'
import { RepoSection } from '@/components/checkouts/repo-section.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Card } from '@/components/ui/card.tsx'
import { Skeleton } from '@/components/ui/skeleton.tsx'
import { useCheckoutPrefs } from '@/hooks/use-checkout-prefs.ts'
import { useCheckouts } from '@/hooks/use-checkouts.ts'

export function Checkouts() {
  const { repos, isPending, error, isStale } = useCheckouts()
  const { prefs, filters, updatePref, setFilters } = useCheckoutPrefs()
  // A repo filter naming a repo that's since been removed shows everything.
  const repoFilter = repos.some((repo) => repo.root === filters.repo)
    ? filters.repo
    : null
  const shownRepos =
    repoFilter === null
      ? repos
      : repos.filter((repo) => repo.root === repoFilter)

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-extrabold text-strong">Checkouts</h1>
          {isStale && (
            <p className="text-sm text-warning">
              Couldn't refresh; showing the last read.
            </p>
          )}
        </div>
        {repos.length > 0 && (
          <CheckoutFilters
            repos={repos}
            filters={{ ...filters, repo: repoFilter }}
            onChange={setFilters}
          />
        )}
      </header>
      {isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      ) : error !== null ? (
        <p className="whitespace-pre-wrap text-destructive" role="alert">
          {error.message}
        </p>
      ) : repos.length === 0 ? (
        <Card className="items-start gap-3 px-6 py-8">
          <h2 className="text-lg font-extrabold text-strong">No repos yet</h2>
          <p className="text-muted-foreground">
            Add the repos on this machine whose worktrees you want to see.
          </p>
          <Button nativeButton={false} render={<Link to="/settings" />}>
            Set up repos
          </Button>
        </Card>
      ) : (
        shownRepos.map((repo) => (
          <RepoSection
            key={repo.root}
            repo={repo}
            prefs={prefs}
            filters={filters}
            onPrefChange={updatePref}
          />
        ))
      )}
    </div>
  )
}
