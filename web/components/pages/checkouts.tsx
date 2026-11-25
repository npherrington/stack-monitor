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
import { NewWorktreeDialog } from '@/components/checkouts/new-worktree-dialog.tsx'
import { RepoSection } from '@/components/checkouts/repo-section.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Card } from '@/components/ui/card.tsx'
import { Skeleton } from '@/components/ui/skeleton.tsx'
import { useAgents } from '@/hooks/use-agents.ts'
import { useCheckoutPrefs } from '@/hooks/use-checkout-prefs.ts'
import { useCheckouts } from '@/hooks/use-checkouts.ts'
import { useRuns } from '@/hooks/use-runs.ts'

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
            latestRuns={latestRuns}
            onRunHere={setRunHere}
            onOpenRun={setOpenRun}
            onNewWorktree={() => setNewIn(repo)}
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
    </div>
  )
}
