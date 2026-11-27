import { ArrowDown, ArrowLeft, ExternalLink } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'

import { Conversation } from '@/components/github/conversation.tsx'
import { FileDiff } from '@/components/github/file-diff.tsx'
import { ReviewPanel } from '@/components/github/review-panel.tsx'
import { Segmented } from '@/components/stack/segmented.tsx'
import { Button } from '@/components/ui/button.tsx'
import { buttonVariants } from '@/components/ui/button-variants.ts'
import { LabelPill } from '@/components/github/label-pill.tsx'
import { Pill } from '@/components/ui/pill.tsx'
import { Skeleton } from '@/components/ui/skeleton.tsx'
import { usePull } from '@/hooks/use-pull.ts'
import { repoPath, type PullTab } from '@/lib/github-links.ts'

interface PullViewProps {
  root: string
  number: number
  tab: PullTab
  onTabChange: (tab: PullTab) => void
}

// One PR, as github.com splits it: the conversation, and the changed files with the review box.
// Every file starts folded.
export function PullView({ root, number, tab, onTabChange }: PullViewProps) {
  const { pull, isPending, error, isStale } = usePull(root, number)
  const review = useRef<HTMLDivElement>(null)
  const [openFiles, setOpenFiles] = useState<ReadonlySet<string>>(new Set())
  // The file a Conversation link opened, scrolled to once Files changed has rendered it.
  const focus = useRef<string | null>(null)
  useEffect(() => {
    if (tab !== 'files' || focus.current === null) return
    document
      .querySelector(`[data-path="${CSS.escape(focus.current)}"]`)
      ?.scrollIntoView({ behavior: 'smooth' })
    focus.current = null
  }, [tab])
  const openFile = (path: string) => {
    setOpenFiles(new Set(openFiles).add(path))
    focus.current = path
    onTabChange('files')
  }
  const toggle = (path: string) => {
    const next = new Set(openFiles)
    if (!next.delete(path)) next.add(path)
    setOpenFiles(next)
  }

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
      <div className="sticky top-0 z-10 -mx-4 -mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-background/95 px-4 py-2 backdrop-blur md:-mx-8 md:-mt-8 md:px-8">
        {back}
        <h1 className="min-w-0 flex-1 basis-48 truncate text-base font-semibold text-strong">
          {pull.title}{' '}
          <span className="font-normal text-muted-foreground">
            #{pull.number}
          </span>
        </h1>
        <Segmented
          label="View"
          options={[
            { value: 'conversation', label: 'Conversation' },
            {
              value: 'files',
              label: `Files changed (${pull.files.length})`,
            },
          ]}
          value={tab}
          onChange={onTabChange}
        />
        {isStale && (
          <span className="text-xs text-warning" role="status">
            Couldn't refresh
          </span>
        )}
        {tab === 'files' && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              review.current?.scrollIntoView({ behavior: 'smooth' })
            }
          >
            <ArrowDown /> Jump to review
          </Button>
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
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-muted-foreground">
        {pull.draft && <Pill>Draft</Pill>}
        <span className="font-medium text-foreground">{pull.author}</span>
        <span aria-hidden="true">·</span>
        <span className="min-w-0 truncate font-mono">
          {pull.branch} → {pull.base}
        </span>
        <span aria-hidden="true">·</span>
        <span className="tabular-nums">
          {pull.changedFiles} {pull.changedFiles === 1 ? 'file' : 'files'}{' '}
          <span className="text-success">+{pull.additions}</span>{' '}
          <span className="text-destructive">−{pull.deletions}</span>
        </span>
        {pull.labels.length > 0 && (
          <span className="flex flex-wrap gap-1.5 sm:ml-2">
            {pull.labels.map((label) => (
              <LabelPill key={label.name} label={label} />
            ))}
          </span>
        )}
      </div>
      {tab === 'conversation' ? (
        <Conversation root={root} pull={pull} onOpenFile={openFile} />
      ) : (
        <>
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setOpenFiles(new Set(pull.files.map((file) => file.path)))
              }
            >
              Expand all
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setOpenFiles(new Set())}
            >
              Collapse all
            </Button>
          </div>
          <div className="flex flex-col gap-3">
            {pull.files.map((file) => (
              <FileDiff
                key={file.path}
                root={root}
                number={pull.number}
                file={file}
                threads={pull.threads.filter(
                  (thread) => thread.path === file.path,
                )}
                hasPendingReview={pull.pendingReview !== null}
                open={openFiles.has(file.path)}
                onToggle={() => toggle(file.path)}
              />
            ))}
          </div>
          <div ref={review} className="scroll-mt-16">
            <ReviewPanel root={root} pull={pull} />
          </div>
        </>
      )}
    </div>
  )
}
