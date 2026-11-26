import { Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'

import type {
  ClaudeWorkflow,
  RepoCheckouts,
  RunSummary,
} from '../../../core/types.ts'
import { RunLogDialog } from '@/components/agents/run-log-dialog.tsx'
import {
  RunHereDialog,
  type RunHereTarget,
} from '@/components/checkouts/run-here-dialog.tsx'
import { ClaudeWorkflowDialog } from '@/components/agents/claude-workflow-dialog.tsx'

import { CheckoutFilters } from '@/components/checkouts/checkout-filters.tsx'
import {
  RemoveWorktreeDialog,
  type RemoveTarget,
} from '@/components/checkouts/remove-worktree-dialog.tsx'
import { NewWorktreeDialog } from '@/components/checkouts/new-worktree-dialog.tsx'
import { RepoSection } from '@/components/checkouts/repo-section.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Card } from '@/components/ui/card.tsx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.tsx'
import { Skeleton } from '@/components/ui/skeleton.tsx'
import { useAgents } from '@/hooks/use-agents.ts'
import { useCheckoutPrefs } from '@/hooks/use-checkout-prefs.ts'
import { useCheckouts } from '@/hooks/use-checkouts.ts'
import { useRuns } from '@/hooks/use-runs.ts'

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`
}

// One repo opens its dialog straight away; several ask which first.
function NewWorktreeButton({
  repos,
  onPick,
}: {
  repos: RepoCheckouts[]
  onPick: (repo: RepoCheckouts) => void
}) {
  if (repos.length === 0) return null
  if (repos.length === 1) {
    return (
      <Button onClick={() => onPick(repos[0])}>
        <Plus aria-hidden="true" />
        New worktree
      </Button>
    )
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button />}>
        <Plus aria-hidden="true" />
        New worktree
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {repos.map((repo) => (
          <DropdownMenuItem key={repo.root} onClick={() => onPick(repo)}>
            {repo.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function Checkouts() {
  const { repos, isPending, error, isStale } = useCheckouts()
  const { prefs, filters, updatePref, setFilters } = useCheckoutPrefs()
  const { runs } = useRuns()
  const { overview } = useAgents()
  const [runHere, setRunHere] = useState<RunHereTarget | null>(null)
  const [claudeRun, setClaudeRun] = useState<{
    workflow: ClaudeWorkflow
    checkout: string
  } | null>(null)
  const [openRun, setOpenRun] = useState<string | null>(null)
  const [newIn, setNewIn] = useState<RepoCheckouts | null>(null)
  const [removing, setRemoving] = useState<RemoveTarget | null>(null)
  const [query, setQuery] = useState('')
  // Runs come newest first, so the first one seen for a checkout is its latest.
  const latestRuns = useMemo(() => {
    const latest = new Map<string, RunSummary>()
    for (const run of runs)
      if (!latest.has(run.checkout)) latest.set(run.checkout, run)
    return latest
  }, [runs])
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
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-strong">Worktrees</h1>
            {repos.length > 0 && (
              <p className="text-sm text-muted-foreground">
                {count(
                  repos.reduce((sum, repo) => sum + repo.checkouts.length, 0),
                  'worktree',
                )}{' '}
                in {count(repos.length, 'repo')}
                {isStale && (
                  <span className="text-warning">
                    {' '}
                    · couldn't refresh, showing the last read
                  </span>
                )}
              </p>
            )}
          </div>
          <NewWorktreeButton
            repos={repos.filter((repo) => repo.problem === null)}
            onPick={setNewIn}
          />
        </div>
        {repos.length > 0 && (
          <CheckoutFilters
            repos={repos}
            filters={{ ...filters, repo: repoFilter }}
            onChange={setFilters}
            query={query}
            onQueryChange={setQuery}
          />
        )}
      </header>
      {isPending ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      ) : error !== null ? (
        <p className="whitespace-pre-wrap text-destructive" role="alert">
          {error.message}
        </p>
      ) : repos.length === 0 ? (
        <Card className="items-start gap-3 px-6 py-8">
          <h2 className="text-base font-semibold text-strong">No repos yet</h2>
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
            query={query.trim()}
            onPrefChange={updatePref}
            latestRuns={latestRuns}
            onRunHere={setRunHere}
            onOpenRun={setOpenRun}
            onNewWorktree={() => setNewIn(repo)}
            onRemove={(checkout) =>
              setRemoving({
                root: repo.root,
                mainline: repo.mainline,
                checkout,
              })
            }
          />
        ))
      )}
      <RunHereDialog
        target={runHere}
        overview={overview}
        onClose={() => setRunHere(null)}
        onStarted={(id) => {
          setRunHere(null)
          setOpenRun(id)
        }}
        onRunClaude={(workflow) => {
          if (runHere !== null) {
            setClaudeRun({ workflow, checkout: runHere.checkout })
          }
          setRunHere(null)
        }}
      />
      <ClaudeWorkflowDialog
        workflow={claudeRun?.workflow ?? null}
        checkout={claudeRun?.checkout}
        onClose={() => setClaudeRun(null)}
        onStarted={(id) => {
          setClaudeRun(null)
          setOpenRun(id)
        }}
      />
      <RunLogDialog runId={openRun} onClose={() => setOpenRun(null)} />
      <NewWorktreeDialog repo={newIn} onClose={() => setNewIn(null)} />
      <RemoveWorktreeDialog
        target={removing}
        onClose={() => setRemoving(null)}
      />
    </div>
  )
}
