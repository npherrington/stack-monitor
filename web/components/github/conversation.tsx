import { GitCommitHorizontal } from 'lucide-react'

import type {
  PullCommit,
  PullDetail,
  PullFile,
  ReviewState,
  TimelineItem,
} from '../../../core/types.ts'
import { Markdown } from '@/components/github/markdown.tsx'
import { ReviewThread } from '@/components/github/review-thread.tsx'
import { Card } from '@/components/ui/card.tsx'
import { Pill } from '@/components/ui/pill.tsx'
import { useReviewMutations } from '@/hooks/use-review-mutations.ts'

const VERDICT: Record<
  ReviewState,
  { label: string; tone: 'good' | 'problem' | 'neutral' }
> = {
  APPROVED: { label: 'approved', tone: 'good' },
  CHANGES_REQUESTED: { label: 'requested changes', tone: 'problem' },
  COMMENTED: { label: 'reviewed', tone: 'neutral' },
  DISMISSED: { label: 'review dismissed', tone: 'neutral' },
}

interface EntryProps {
  item: TimelineItem
}

function Entry({ item }: EntryProps) {
  return (
    <Card className="gap-2 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold text-strong">{item.author}</span>
        {item.kind === 'review' && (
          <Pill tone={VERDICT[item.state].tone}>
            {VERDICT[item.state].label}
          </Pill>
        )}
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:underline"
        >
          {new Date(item.at).toLocaleString()}
        </a>
      </div>
      {item.body.trim() !== '' && <Markdown text={item.body} />}
    </Card>
  )
}

interface CommitListProps {
  commits: PullCommit[]
}

function CommitList({ commits }: CommitListProps) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-strong">
        Commits ({commits.length})
      </h2>
      <Card className="gap-0 py-0">
        <ol className="divide-y">
          {commits.map((commit) => (
            <li key={commit.sha} className="flex flex-col gap-0.5 px-3 py-2">
              <span className="text-xs break-words text-foreground">
                {commit.headline}
              </span>
              <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                <GitCommitHorizontal className="size-3.5" aria-hidden="true" />
                <a
                  href={commit.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono hover:underline"
                >
                  {commit.sha.slice(0, 7)}
                </a>
                <span>{commit.author}</span>
                <span>{new Date(commit.at).toLocaleDateString()}</span>
              </span>
            </li>
          ))}
        </ol>
      </Card>
    </section>
  )
}

interface FileListProps {
  files: PullFile[]
  threadsOn: Map<string, number> // threads by path
  onOpen: (path: string) => void
}

function FileList({ files, threadsOn, onOpen }: FileListProps) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-strong">
        Files changed ({files.length})
      </h2>
      <Card className="gap-0 py-0">
        <ul className="divide-y">
          {files.map((file) => (
            <li key={file.path}>
              <button
                type="button"
                onClick={() => onOpen(file.path)}
                className="flex w-full flex-col gap-0.5 px-3 py-2 text-left outline-none hover:bg-muted/50 focus-visible:bg-muted/50"
              >
                <span className="font-mono text-xs break-all text-foreground">
                  {file.path}
                </span>
                <span className="flex items-center gap-2 text-xs tabular-nums">
                  <span className="text-success">+{file.additions}</span>
                  <span className="text-destructive">−{file.deletions}</span>
                  {(threadsOn.get(file.path) ?? 0) > 0 && (
                    <span className="text-muted-foreground">
                      {threadsOn.get(file.path)}{' '}
                      {threadsOn.get(file.path) === 1 ? 'thread' : 'threads'}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  )
}

interface ConversationProps {
  root: string
  pull: PullDetail
  onOpenFile: (path: string) => void // shows the file in Files changed
}

// The PR at a glance, in three columns on a wide screen: the discussion (what it says, comments and
// reviews in order, then every line thread), its commits, and the files it changes.
export function Conversation({ root, pull, onOpenFile }: ConversationProps) {
  const { reply, resolve, deleteComment, isResolving, isDeleting } =
    useReviewMutations(root, pull.number)
  const threadsOn = new Map<string, number>()
  for (const thread of pull.threads) {
    threadsOn.set(thread.path, (threadsOn.get(thread.path) ?? 0) + 1)
  }

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_15rem_15rem]">
      <div className="flex min-w-0 flex-col gap-3">
        <Card className="gap-2 px-4 py-4">
          <span className="text-xs font-semibold text-strong">
            {pull.author}
          </span>
          {pull.body.trim() === '' ? (
            <p className="text-sm text-muted-foreground">No description.</p>
          ) : (
            <Markdown text={pull.body} />
          )}
        </Card>
        {pull.timeline.map((item) => (
          <Entry key={item.id} item={item} />
        ))}
        {pull.threads.length > 0 && (
          <section className="flex flex-col gap-3 pt-2">
            <h2 className="text-sm font-semibold text-strong">
              Line threads ({pull.threads.length})
            </h2>
            {pull.threads.map((thread) => (
              <div key={thread.id} className="flex flex-col gap-1">
                <span className="font-mono text-xs break-all text-muted-foreground">
                  {thread.path}
                  {thread.line !== null && `:${thread.line}`}
                </span>
                <ReviewThread
                  thread={thread}
                  hasPendingReview={pull.pendingReview !== null}
                  onReply={reply}
                  onResolve={resolve}
                  onDelete={deleteComment}
                  isBusy={isResolving || isDeleting}
                />
              </div>
            ))}
          </section>
        )}
      </div>
      <CommitList commits={pull.commits} />
      <FileList files={pull.files} threadsOn={threadsOn} onOpen={onOpenFile} />
    </div>
  )
}
