import { useState } from 'react'

import type { ReviewThread as Thread } from '../../../core/types.ts'
import { CommentForm } from '@/components/github/comment-form.tsx'
import { Markdown } from '@/components/github/markdown.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Pill } from '@/components/ui/pill.tsx'

interface ReviewThreadProps {
  thread: Thread
  hasPendingReview: boolean // a reply then joins the draft rather than posting
  onReply: (thread: string, body: string) => Promise<unknown>
  onResolve: (thread: string, resolved: boolean) => void
  onDelete: (comment: string) => void
  isBusy: boolean
}

// One review thread on a diff line: its comments, then reply and resolve. A resolved thread starts
// folded, as on github.com.
export function ReviewThread({
  thread,
  hasPendingReview,
  onReply,
  onResolve,
  onDelete,
  isBusy,
}: ReviewThreadProps) {
  const [open, setOpen] = useState(!thread.resolved)
  const [replying, setReplying] = useState(false)
  const posted = thread.comments.some((comment) => !comment.pending)

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 font-sans">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {thread.resolved && <Pill tone="good">Resolved</Pill>}
        {thread.outdated && <Pill tone="attention">Outdated</Pill>}
        <span className="text-muted-foreground">
          {thread.comments.length}{' '}
          {thread.comments.length === 1 ? 'comment' : 'comments'}
        </span>
        <span className="flex-1" />
        {thread.resolved && (
          <Button variant="ghost" size="xs" onClick={() => setOpen(!open)}>
            {open ? 'Fold' : 'Show'}
          </Button>
        )}
        {posted && (
          <Button
            variant="outline"
            size="xs"
            disabled={isBusy}
            onClick={() => onResolve(thread.id, !thread.resolved)}
          >
            {thread.resolved ? 'Reopen' : 'Resolve'}
          </Button>
        )}
      </div>
      {open && (
        <>
          <ol className="flex flex-col gap-3">
            {thread.comments.map((comment) => (
              <li key={comment.id} className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold text-strong">
                    {comment.author}
                  </span>
                  <a
                    href={comment.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:underline"
                  >
                    {new Date(comment.createdAt).toLocaleString()}
                  </a>
                  {comment.pending && <Pill tone="highlight">Pending</Pill>}
                  {comment.pending && comment.mine && (
                    <Button
                      variant="ghost"
                      size="xs"
                      disabled={isBusy}
                      onClick={() => onDelete(comment.id)}
                    >
                      Delete
                    </Button>
                  )}
                </div>
                <Markdown text={comment.body} />
              </li>
            ))}
          </ol>
          {posted &&
            (replying ? (
              <CommentForm
                label="Reply"
                submitLabel={
                  hasPendingReview ? 'Add reply to review' : 'Reply now'
                }
                failureTitle="Couldn't reply"
                onSubmit={(body) => onReply(thread.id, body)}
                onDone={() => setReplying(false)}
              />
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="self-start"
                onClick={() => setReplying(true)}
              >
                Reply
              </Button>
            ))}
        </>
      )}
    </div>
  )
}
