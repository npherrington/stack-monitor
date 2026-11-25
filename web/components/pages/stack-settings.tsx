import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router'

import { StackEditor } from '@/components/stack/stack-editor.tsx'
import { Skeleton } from '@/components/ui/skeleton.tsx'
import { useRepoStack } from '@/hooks/use-repo-stack.ts'
import { useRepos } from '@/hooks/use-repos.ts'

export function StackSettings() {
  const root = decodeURIComponent(useParams().root ?? '')
  const { repos } = useRepos()
  const { repoStack, isPending, error } = useRepoStack(root)
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
        <h1 className="text-2xl font-extrabold text-strong">{name}: stack</h1>
        <p className="text-muted-foreground">
          The commands that start this repo’s services, and how the monitor
          tells each one is up. Every checkout’s card shows them.
        </p>
      </div>
      {isPending ? (
        <Skeleton className="h-64" />
      ) : error !== null || repoStack === null ? (
        <p className="text-destructive" role="alert">
          {error?.message ?? "The monitor didn't send the stack."}
        </p>
      ) : (
        <>
          {!repoStack.editable && repoStack.source !== null && (
            <p className="rounded-xl bg-accent px-4 py-3 text-sm text-accent-foreground">
              In effect now:{' '}
              <span className="font-mono">{repoStack.source}</span>, the repo’s
              own file. Saving copies it to your config on this machine, which
              then takes over.
            </p>
          )}
          <StackEditor key={repoStack.source ?? 'none'} repoStack={repoStack} />
        </>
      )}
    </div>
  )
}
