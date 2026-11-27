import { ArrowLeft, ExternalLink } from 'lucide-react'
import { Link } from 'react-router'

import { FileDiff } from '@/components/github/file-diff.tsx'
import { Markdown } from '@/components/github/markdown.tsx'
import { ReviewPanel } from '@/components/github/review-panel.tsx'
import { buttonVariants } from '@/components/ui/button-variants.ts'
import { Card } from '@/components/ui/card.tsx'
import { Pill } from '@/components/ui/pill.tsx'
import { Skeleton } from '@/components/ui/skeleton.tsx'
import { usePull } from '@/hooks/use-pull.ts'
import { repoPath } from '@/lib/github-links.ts'

interface PullViewProps {
  root: string
  number: number
}

// One PR: what it says, every changed file with its threads, and the review box.
export function PullView({ root, number }: PullViewProps) {
  const { pull, isPending, error, isStale } = usePull(root, number)

  const back = (
    <Link
      to={repoPath(root)}
      className={buttonVariants({ variant: 'ghost', size: 'sm' })}
    >
      <ArrowLeft /> All PRs
    </Link>
  )

  if (isPending) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <Skeleton className="h-24" />
        <Skeleton className="h-64" />
      </div>
    )
  }
  if (pull === null) {
    return (
      <div className="flex flex-col items-start gap-4">
        {back}
        <p className="whitespace-pre-wrap text-destructive" role="alert">
          {error?.message ?? `Couldn't read #${number}`}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {back}
        <span className="flex-1" />
        {isStale && (
          <span className="text-xs text-warning" role="status">
            Couldn't refresh; showing the last read
          </span>
        )}
        <a
          href={pull.url}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          On GitHub <ExternalLink />
        </a>
      </div>
      <header className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold break-words text-strong">
          {pull.title}{' '}
          <span className="font-normal text-muted-foreground">
            #{pull.number}
          </span>
        </h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {pull.draft && <Pill>Draft</Pill>}
          <span>{pull.author}</span>
          <span className="font-mono">
            {pull.branch} → {pull.base}
          </span>
          <span>
            {pull.changedFiles} {pull.changedFiles === 1 ? 'file' : 'files'}
          </span>
          <span className="text-success tabular-nums">+{pull.additions}</span>
          <span className="text-destructive tabular-nums">
            −{pull.deletions}
          </span>
        </div>
      </header>
      <Card className="px-4 py-4">
        {pull.body.trim() === '' ? (
          <p className="text-sm text-muted-foreground">No description.</p>
        ) : (
          <Markdown text={pull.body} />
        )}
      </Card>
      <div className="flex flex-col gap-3">
        {pull.files.map((file) => (
          <FileDiff
            key={file.path}
            root={root}
            number={pull.number}
            file={file}
            threads={pull.threads.filter((thread) => thread.path === file.path)}
            hasPendingReview={pull.pendingReview !== null}
          />
        ))}
      </div>
      <ReviewPanel root={root} pull={pull} />
    </div>
  )
}
