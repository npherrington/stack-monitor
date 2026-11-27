import { Archive, ArchiveRestore, Bot, Trash2 } from 'lucide-react'
import { useState } from 'react'

import type { BoardProject } from '../../../core/types.ts'
import { CommentThread } from '@/components/board/comment-thread.tsx'
import { ConfirmDeleteDialog } from '@/components/board/confirm-delete-dialog.tsx'
import { TicketEditForm } from '@/components/board/ticket-edit-form.tsx'
import { TicketProperties } from '@/components/board/ticket-properties.tsx'
import { WorkTicketDialog } from '@/components/board/work-ticket-dialog.tsx'
import { Button } from '@/components/ui/button.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.tsx'
import { Skeleton } from '@/components/ui/skeleton.tsx'
import { useBoardFlow } from '@/hooks/use-board-flow.ts'
import { useProjectBoard } from '@/hooks/use-project-board.ts'
import { useTicket } from '@/hooks/use-ticket.ts'
import { useTicketMutations } from '@/hooks/use-ticket-mutations.ts'
import { formatWhen } from '@/lib/board-dates.ts'
import type { NoArgCallback } from '@/lib/callbacks.ts'
import { quietly } from '@/lib/quietly.ts'

interface TicketDialogProps {
  project: BoardProject
  number: number | null // the ticket the URL has open; open while set
  onClose: NoArgCallback
}

// One ticket, opened from its card or a link: what it says, where it sits, and its comments.
export function TicketDialog({ project, number, onClose }: TicketDialogProps) {
  return (
    <Dialog open={number !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        {number !== null && (
          <Ticket
            key={`${project.id}:${number}`}
            project={project}
            number={number}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

interface TicketProps {
  project: BoardProject
  number: number
}

function Ticket({ project, number }: TicketProps) {
  const { ticket, isPending, error } = useTicket(project.id, number)
  const board = useProjectBoard(project.id)
  const { shelveTicket, removeTicket, isShelving } = useBoardFlow()
  const { archiveTicket, isArchiving } = useTicketMutations()
  const [deleting, setDeleting] = useState(false)
  const [working, setWorking] = useState(false)

  if (isPending || board.isPending) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>
            {project.prefix}-{number}
          </DialogTitle>
        </DialogHeader>
        <Skeleton className="h-64" />
      </>
    )
  }
  if (ticket === null || board.board === null) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>
            {project.prefix}-{number}
          </DialogTitle>
        </DialogHeader>
        <p role="alert" className="text-sm text-destructive">
          {error?.message ?? board.error?.message ?? "Couldn't read the ticket"}
        </p>
      </>
    )
  }

  const ref = { id: ticket.id, project: project.id }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{ticket.key}</DialogTitle>
        <DialogDescription>
          In {project.name}, since {formatWhen(ticket.createdAt)}
        </DialogDescription>
      </DialogHeader>
      {ticket.archived && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-xl bg-warning/10 p-2 text-sm text-warning"
        >
          <span className="flex-1">
            This ticket is archived, so it isn't on the board.
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={isArchiving}
            onClick={() => quietly(archiveTicket(ticket.id, false))}
          >
            <ArchiveRestore />
            Restore
          </Button>
        </p>
      )}
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_14rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <TicketEditForm ticket={ticket} />
          <CommentThread ticket={ticket} />
        </div>
        <div className="flex flex-col gap-4">
          <TicketProperties ticket={ticket} board={board.board} />
          <div className="flex flex-wrap gap-2">
            {!ticket.archived && (
              <Button size="sm" onClick={() => setWorking(true)}>
                <Bot />
                Work this ticket
              </Button>
            )}
            {!ticket.archived && (
              <Button
                variant="outline"
                size="sm"
                disabled={isShelving}
                onClick={() => quietly(shelveTicket(ref))}
              >
                <Archive />
                Archive
              </Button>
            )}
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDeleting(true)}
            >
              <Trash2 />
              Delete…
            </Button>
          </div>
        </div>
      </div>
      <ConfirmDeleteDialog
        question={
          deleting
            ? {
                title: `Delete ${ticket.key}?`,
                description:
                  'The ticket and its comments go for good. Archive it instead to keep it off the board.',
                confirmLabel: 'Delete ticket',
              }
            : null
        }
        onConfirm={() => removeTicket(ref)}
        onClose={() => setDeleting(false)}
      />
      <WorkTicketDialog
        project={project}
        ticket={working ? ticket : null}
        onClose={() => setWorking(false)}
      />
    </>
  )
}
