import { useState } from 'react'

import type { TicketComment, TicketDetail } from '../../../core/types.ts'
import { CommentEditor } from '@/components/board/comment-editor.tsx'
import { ConfirmDeleteDialog } from '@/components/board/confirm-delete-dialog.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Markdown } from '@/components/ui/markdown.tsx'
import { useTicketMutations } from '@/hooks/use-ticket-mutations.ts'
import { formatWhen } from '@/lib/board-dates.ts'

interface CommentThreadProps {
  ticket: TicketDetail
}

// A ticket's notes, oldest first, with the box for the next one under them.
export function CommentThread({ ticket }: CommentThreadProps) {
  const { saveComment, deleteComment } = useTicketMutations()
  const [editing, setEditing] = useState<number | null>(null)
  const [deleting, setDeleting] = useState<TicketComment | null>(null)

  return (
    <section aria-label="Comments" className="flex flex-col gap-3">
      <h4 className="text-sm font-semibold text-strong">
        Comments
        {ticket.comments.length > 0 && (
          <span className="ml-1.5 text-xs font-normal text-muted-foreground tabular-nums">
            {ticket.comments.length}
          </span>
        )}
      </h4>
      {ticket.comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No comments yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {ticket.comments.map((comment) => (
            <li
              key={comment.id}
              className="flex flex-col gap-2 rounded-xl bg-muted/50 p-3"
            >
              {editing === comment.id ? (
                <CommentEditor
                  label="Edit the comment"
                  initial={comment.body}
                  submitLabel="Save"
                  onSubmit={(body) =>
                    saveComment({ id: comment.id, ticket: ticket.id, body })
                  }
                  onDone={() => setEditing(null)}
                />
              ) : (
                <>
                  <Markdown text={comment.body} />
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <span className="mr-auto">
                      {formatWhen(comment.createdAt)}
                      {comment.editedAt !== null && ' · edited'}
                    </span>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => setEditing(comment.id)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => setDeleting(comment)}
                    >
                      Delete…
                    </Button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <CommentEditor
        label="Add a comment"
        submitLabel="Comment"
        onSubmit={(body) => saveComment({ ticket: ticket.id, body })}
      />
      <ConfirmDeleteDialog
        question={
          deleting === null
            ? null
            : {
                title: 'Delete this comment?',
                description: 'It goes for good.',
                confirmLabel: 'Delete comment',
              }
        }
        onConfirm={() =>
          deleting === null ? Promise.resolve() : deleteComment(deleting.id)
        }
        onClose={() => setDeleting(null)}
      />
    </section>
  )
}
