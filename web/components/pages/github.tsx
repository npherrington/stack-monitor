import { Link, useNavigate, useSearchParams } from 'react-router'

import { PullList } from '@/components/github/pull-list.tsx'
import { PullView } from '@/components/github/pull-view.tsx'
import { Segmented } from '@/components/stack/segmented.tsx'
import { Skeleton } from '@/components/ui/skeleton.tsx'
import { useCheckouts } from '@/hooks/use-checkouts.ts'
import { usePulls } from '@/hooks/use-pulls.ts'
import {
  pullPath,
  readPullNumber,
  readPullTab,
  repoPath,
} from '@/lib/github-links.ts'

// A repo's open PRs on GitHub, one repo at a time, and one PR to read and review. Everything goes
// through gh as its login.
export function Github() {
  const { repos, isPending: reposPending } = useCheckouts()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const asked = params.get('repo')
  const current =
    asked === null ? repos[0] : repos.find((repo) => repo.root === asked)
  const number = readPullNumber(params.get('pr'))
  const { list, isPending, error, isStale } = usePulls(
    number === null ? (current?.root ?? null) : null,
  )

  return (
    <div className="flex flex-col gap-6">
      {number === null && (
        <header className="flex flex-col gap-3">
          <h1 className="text-2xl font-semibold text-strong">GitHub</h1>
          <p className="text-muted-foreground">
            Open PRs, their changed files and review threads. Line comments go
            into your pending review on GitHub until you submit it.
          </p>
          {repos.length > 1 && (
            <Segmented
              label="Repo"
              options={repos.map((repo) => ({
                value: repo.root,
                label: repo.name,
              }))}
              value={current?.root ?? ''}
              onChange={(root) => navigate(repoPath(root))}
            />
          )}
        </header>
      )}
      {reposPending ? (
        <Skeleton className="h-64" />
      ) : current === undefined && asked !== null ? (
        <p className="text-muted-foreground">
          {asked} isn't in the list.{' '}
          <Link to="/github" className="font-semibold underline">
            Show another repo
          </Link>
          .
        </p>
      ) : current === undefined ? (
        <p className="text-muted-foreground">
          No repos yet.{' '}
          <Link to="/settings" className="font-semibold underline">
            Add one in Settings
          </Link>
          .
        </p>
      ) : number !== null ? (
        <PullView
          root={current.root}
          number={number}
          tab={readPullTab(params.get('tab'))}
          onTabChange={(tab) => navigate(pullPath(current.root, number, tab))}
        />
      ) : isPending ? (
        <Skeleton className="h-64" />
      ) : list === null ? (
        <p className="whitespace-pre-wrap text-destructive" role="alert">
          {error?.message ?? "Couldn't read the PRs"}
        </p>
      ) : (
        <>
          {isStale && (
            <p className="text-xs text-warning" role="status">
              Couldn't refresh; showing the last read
            </p>
          )}
          <PullList root={current.root} list={list} />
        </>
      )}
    </div>
  )
}
