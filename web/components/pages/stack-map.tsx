import { ReactFlowProvider } from '@xyflow/react'
import { Link } from 'react-router'

import { MapEditor } from '@/components/feature-map/map-editor.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Skeleton } from '@/components/ui/skeleton.tsx'
import { useFeatureMap } from '@/hooks/use-feature-map.ts'
import { useRepos } from '@/hooks/use-repos.ts'
import { useStackMap } from '@/hooks/use-stack-map.ts'
import { useStackMapRoute } from '@/hooks/use-stack-map-route.ts'
import { blankMap } from '@/lib/stack-map-canvas.ts'

export function StackMap() {
  const { repos: tracked, isPending: reposPending } = useRepos()
  const route = useStackMapRoute()
  const repos = tracked.filter((repo) => repo.problem === null)
  const asked = route.repo
  const current =
    asked === null ? repos[0] : repos.find((repo) => repo.root === asked)
  const root = current?.root ?? null
  const { overview, palette, isPending, error } = useFeatureMap(root)
  const named = useStackMap(root, route.map)

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold text-strong">Stack map</h1>
        <p className="text-muted-foreground">
          Sketch how a feature moves through the stack: blocks joined by arrows,
          saved as a file in the repo for you to commit.
        </p>
      </header>
      {reposPending ? (
        <Skeleton className="h-96" />
      ) : current === undefined && asked !== null ? (
        <p className="text-muted-foreground">
          {asked} isn't in the list.{' '}
          <Link to="/stack-map" className="font-semibold underline">
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
      ) : isPending ? (
        <Skeleton className="h-96" />
      ) : overview === null ? (
        <p className="whitespace-pre-wrap text-destructive" role="alert">
          {error?.message ?? "Couldn't read the stack map"}
        </p>
      ) : route.map !== null && named.map === null ? (
        named.isPending ? (
          <Skeleton className="h-96" />
        ) : (
          <div className="flex flex-col items-start gap-3">
            <p className="whitespace-pre-wrap text-destructive" role="alert">
              {named.error?.message ?? "Couldn't read the map"}
            </p>
            <Button
              variant="outline"
              onClick={() => route.startDraft(current.root, blankMap())}
            >
              Start a new map
            </Button>
          </div>
        )
      ) : (
        <ReactFlowProvider
          key={
            route.map === null
              ? `${current.root}:draft:${route.draft.key}`
              : `${current.root}:map:${route.map}`
          }
        >
          <MapEditor
            root={current.root}
            repos={repos}
            overview={overview}
            palette={palette}
            name={route.map}
            map={named.map ?? route.draft.map}
            route={route}
          />
        </ReactFlowProvider>
      )}
    </div>
  )
}
