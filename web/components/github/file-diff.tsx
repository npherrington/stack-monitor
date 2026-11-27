import { ChevronDown, ChevronRight, Plus } from 'lucide-react'
import { Fragment, useState } from 'react'

import type {
  DiffLine,
  DiffSide,
  PullFile,
  ReviewThread as Thread,
} from '../../../core/types.ts'
import { CommentForm } from '@/components/github/comment-form.tsx'
import { ReviewThread } from '@/components/github/review-thread.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Pill } from '@/components/ui/pill.tsx'
import { useReviewMutations } from '@/hooks/use-review-mutations.ts'
import { cn } from '@/lib/utils.ts'

// Past this many changed lines a file starts folded, so one generated file can't bury the rest.
const FOLD_OVER = 400

const LINE_TONE: Record<DiffLine['kind'], string> = {
  context: '',
  add: 'bg-success/10',
  del: 'bg-destructive/10',
}
const LINE_MARK: Record<DiffLine['kind'], string> = {
  context: ' ',
  add: '+',
  del: '-',
}

// Where a comment on this line lands: the head's line number, or the base's for a removed line.
function anchor(line: DiffLine): { side: DiffSide; line: number } {
  return line.kind === 'del'
    ? { side: 'LEFT', line: line.old ?? 0 }
    : { side: 'RIGHT', line: line.new ?? 0 }
}

const key = (side: DiffSide, line: number) => `${side}:${line}`

interface FileDiffProps {
  root: string
  number: number
  file: PullFile
  threads: Thread[] // this file's
  hasPendingReview: boolean
}

export function FileDiff({
  root,
  number,
  file,
  threads,
  hasPendingReview,
}: FileDiffProps) {
  const { comment, reply, resolve, deleteComment, isResolving, isDeleting } =
    useReviewMutations(root, number)
  const [open, setOpen] = useState(file.additions + file.deletions <= FOLD_OVER)
  const [commenting, setCommenting] = useState<string | null>(null)

  const onLine = new Map<string, Thread[]>()
  const shown = new Set<string>()
  for (const hunk of file.hunks ?? []) {
    for (const line of hunk.lines) {
      const { side, line: at } = anchor(line)
      shown.add(key(side, at))
      // A context line is on both sides: a thread on its base line belongs here too.
      if (line.kind === 'context' && line.old !== null) {
        shown.add(key('LEFT', line.old))
      }
    }
  }
  const elsewhere: Thread[] = []
  for (const thread of threads) {
    const at = thread.line === null ? null : key(thread.side, thread.line)
    if (at === null || !shown.has(at)) {
      elsewhere.push(thread)
      continue
    }
    onLine.set(at, [...(onLine.get(at) ?? []), thread])
  }

  const threadView = (thread: Thread) => (
    <ReviewThread
      key={thread.id}
      thread={thread}
      hasPendingReview={hasPendingReview}
      onReply={reply}
      onResolve={resolve}
      onDelete={deleteComment}
      isBusy={isResolving || isDeleting}
    />
  )

  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      <header className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={open ? `Fold ${file.path}` : `Show ${file.path}`}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? <ChevronDown /> : <ChevronRight />}
        </Button>
        <span className="min-w-0 font-mono text-xs break-all text-strong">
          {file.previousPath !== null && `${file.previousPath} → `}
          {file.path}
        </span>
        {file.status !== 'modified' && <Pill>{file.status}</Pill>}
        <span className="flex-1" />
        <span className="text-xs font-medium text-success tabular-nums">
          +{file.additions}
        </span>
        <span className="text-xs font-medium text-destructive tabular-nums">
          −{file.deletions}
        </span>
        {threads.length > 0 && (
          <Pill tone="highlight">
            {threads.length} {threads.length === 1 ? 'thread' : 'threads'}
          </Pill>
        )}
      </header>
      {open && (
        <div className="flex flex-col">
          {elsewhere.length > 0 && (
            <div className="flex flex-col gap-2 border-b p-3">
              <p className="text-xs text-muted-foreground">
                On lines no longer in this diff
              </p>
              {elsewhere.map(threadView)}
            </div>
          )}
          {file.hunks === null ? (
            <p className="p-3 text-xs text-muted-foreground">
              GitHub sends no diff for this file (binary, or too large to show).
            </p>
          ) : (
            <div className="overflow-x-auto font-mono text-xs">
              {file.hunks.map((hunk) => (
                <Fragment key={hunk.header}>
                  <div className="bg-muted px-3 py-1 whitespace-pre text-muted-foreground">
                    {hunk.header}
                  </div>
                  {hunk.lines.map((line) => {
                    const { side, line: at } = anchor(line)
                    const here = key(side, at)
                    const lineThreads = [
                      ...(onLine.get(here) ?? []),
                      ...(line.kind === 'context' && line.old !== null
                        ? (onLine.get(key('LEFT', line.old)) ?? [])
                        : []),
                    ]
                    return (
                      <Fragment key={`${line.old}:${line.new}`}>
                        <div
                          className={cn(
                            'group flex min-w-max items-start',
                            LINE_TONE[line.kind],
                          )}
                        >
                          <span className="w-10 shrink-0 px-1 text-right text-muted-foreground select-none">
                            {line.old ?? ''}
                          </span>
                          <span className="w-10 shrink-0 px-1 text-right text-muted-foreground select-none">
                            {line.new ?? ''}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            aria-label={`Comment on line ${at}`}
                            className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                            onClick={() => setCommenting(here)}
                          >
                            <Plus />
                          </Button>
                          <span className="pr-4 whitespace-pre">
                            {LINE_MARK[line.kind]}
                            {line.text}
                          </span>
                        </div>
                        {(lineThreads.length > 0 || commenting === here) && (
                          <div className="flex max-w-3xl flex-col gap-2 px-3 py-2">
                            {lineThreads.map(threadView)}
                            {commenting === here && (
                              <CommentForm
                                label={`Comment on line ${at}`}
                                submitLabel="Add to review"
                                failureTitle="Couldn't add the comment"
                                onSubmit={(body) =>
                                  comment({
                                    path: file.path,
                                    line: at,
                                    side,
                                    body,
                                  })
                                }
                                onDone={() => setCommenting(null)}
                              />
                            )}
                          </div>
                        )}
                      </Fragment>
                    )
                  })}
                </Fragment>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
