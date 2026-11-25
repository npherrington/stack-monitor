import { Layers, Trash2 } from 'lucide-react'
import { Link } from 'react-router'

import { MODULE_NAMES, type ModuleName } from '../../../core/types.ts'
import { Button } from '@/components/ui/button.tsx'
import { Pill } from '@/components/ui/pill.tsx'
import { Skeleton } from '@/components/ui/skeleton.tsx'
import { StatusDot } from '@/components/ui/status-dot.tsx'
import { useRepos } from '@/hooks/use-repos.ts'

const MODULE_LABELS: Record<ModuleName, string> = {
  worktrees: 'Worktrees',
  stack: 'Stack',
  agents: 'Agents',
  featureMap: 'Feature map',
}

// The tracked repos: where each one's config comes from and what it turns on. Remove only takes a
// repo off the list; nothing on disk changes.
export function RepoList() {
  const { repos, isPending, error, removeRepo } = useRepos()
  if (isPending) return <Skeleton className="h-24" />
  if (error !== null) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {error.message}
      </p>
    )
  }
  if (repos.length === 0) {
    return (
      <p className="text-muted-foreground">
        No repos yet. Add one by its path, or find the ones in a folder below.
      </p>
    )
  }
  return (
    <ul className="flex flex-col divide-y rounded-xl border bg-card">
      {repos.map((repo) => (
        <li key={repo.root} className="flex flex-col gap-2 px-4 py-3">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-bold text-strong">{repo.name}</p>
              <p className="truncate font-mono text-xs text-muted-foreground">
                {repo.root}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={
                <Link to={`/settings/stack/${encodeURIComponent(repo.root)}`} />
              }
            >
              <Layers />
              Stack
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => removeRepo(repo.root)}
              aria-label={`Stop tracking ${repo.name}`}
            >
              <Trash2 />
              Remove
            </Button>
          </div>
          {repo.problem !== null ? (
            <p className="text-sm text-destructive" role="alert">
              {repo.problem}
            </p>
          ) : repo.config === null ? null : repo.config.ok ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
              <Pill>
                {repo.config.source === null
                  ? 'no stack-monitor.json: defaults'
                  : repo.config.source}
              </Pill>
              {MODULE_NAMES.map((name) => {
                const on = repo.config?.ok === true && repo.config.modules[name]
                return (
                  <span
                    key={name}
                    className="flex items-center gap-1.5 text-muted-foreground"
                  >
                    <StatusDot state={on ? 'on' : 'off'} />
                    {MODULE_LABELS[name]}
                    <span className="sr-only">{on ? 'on' : 'off'}</span>
                  </span>
                )
              })}
            </div>
          ) : (
            <p
              className="text-sm whitespace-pre-wrap text-destructive"
              role="alert"
            >
              {repo.config.problem}
            </p>
          )}
        </li>
      ))}
    </ul>
  )
}
