import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router'

import { WorktreesEditor } from '@/components/worktrees/worktrees-editor.tsx'
import { Skeleton } from '@/components/ui/skeleton.tsx'
import { useRepoWorktrees } from '@/hooks/use-repo-worktrees.ts'
import { useRepos } from '@/hooks/use-repos.ts'

export function WorktreeSettings() {
  const root = decodeURIComponent(useParams().root ?? '')
  const { repos } = useRepos()
  const { repoWorktrees, isPending, error } = useRepoWorktrees(root)
  const name = repos.find((repo) => repo.root === root)?.name ?? root

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          to="/settings"
          className="flex items-center gap-1 self-start text-sm font-semibold text-muted-foreground hover:text-strong"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Settings
        </Link>
        <h1 className="text-2xl font-semibold text-strong">
          {name}: worktrees
        </h1>
        <p className="text-muted-foreground">
          How a new worktree of this repo is made, set up and taken down.
        </p>
      </div>
      {isPending ? (
        <Skeleton className="h-64" />
      ) : error !== null || repoWorktrees === null ? (
        <p className="text-destructive" role="alert">
          {error?.message ?? "The monitor didn't send the worktree settings."}
        </p>
      ) : (
        <>
          {!repoWorktrees.editable && repoWorktrees.source !== null && (
            <p className="rounded-xl bg-accent px-4 py-3 text-sm text-accent-foreground">
              In effect now:{' '}
              <span className="font-mono">{repoWorktrees.source}</span>, the
              repo’s own file. Saving copies it to your config on this machine,
              which then takes over.
            </p>
          )}
          <WorktreesEditor
            key={repoWorktrees.source ?? 'none'}
            repoWorktrees={repoWorktrees}
          />
        </>
      )}
    </div>
  )
}
