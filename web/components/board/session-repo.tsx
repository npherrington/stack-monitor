import type { ReactNode } from 'react'
import { Link } from 'react-router'

import type { RepoCheckouts } from '../../../core/types.ts'
import { RepoSelect } from '@/components/ui/repo-select.tsx'
import { Skeleton } from '@/components/ui/skeleton.tsx'
import { useBoardRepo } from '@/hooks/use-board-repo.ts'

interface SessionRepoProps {
  project: number
  children: (repo: RepoCheckouts) => ReactNode // the form for the repo picked
}

// The part the board's session dialogs share: which repo the session runs in, asked only when
// more than one is tracked, with the loading, failure and empty states of that list.
export function SessionRepo({ project, children }: SessionRepoProps) {
  const { repos, repo, pickRepo, isPending, error } = useBoardRepo(project)
  if (isPending) return <Skeleton className="h-56" />
  if (error !== null) {
    return (
      <p role="alert" className="text-sm whitespace-pre-wrap text-destructive">
        {error.message}
      </p>
    )
  }
  if (repo === undefined) {
    return (
      <p className="text-sm text-muted-foreground">
        There's no repo to start it in yet.{' '}
        <Link to="/settings" className="font-semibold underline">
          Add one in Settings
        </Link>
        .
      </p>
    )
  }
  return (
    <>
      {repos.length > 1 && (
        <RepoSelect
          id="session-repo"
          repos={repos}
          value={repo.root}
          onChange={pickRepo}
        />
      )}
      {children(repo)}
    </>
  )
}
