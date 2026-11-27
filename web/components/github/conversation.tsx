import { GitCommitHorizontal } from 'lucide-react'

import type {
  PullDetail,
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
  if (item.kind === 'commit') {
    return (
      <div className="flex min-w-0 items-center gap-2 px-4 text-xs text-muted-foreground">
        <GitCommitHorizontal className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="shrink-0">{item.author}</span>
        <span className="min-w-0 truncate text-foreground">
          {item.headline}
        </span>
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 font-mono hover:underline"
        >
          {item.id.slice(0, 7)}
        </a>
      </div>
    )
  }
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

interface ConversationProps {
  root: string
  pull: PullDetail
}

// The PR as a discussion: what it says, the comments, commits and reviews on it in order, then
// every line thread with where it sits.
export function Conversation({ root, pull }: ConversationProps) {
  const { reply, resolve, deleteComment, isResolving, isDeleting } =
    useReviewMutations(root, pull.number)

  return (
    <div className="flex flex-col gap-3">
      <Card className="gap-2 px-4 py-4">
        <span className="text-xs font-semibold text-strong">{pull.author}</span>
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
  )
}
