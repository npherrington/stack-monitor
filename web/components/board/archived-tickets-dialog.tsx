import { useState } from 'react'
import { Link } from 'react-router'

import type { ArchivedTicket, BoardProject } from '../../../core/types.ts'
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog.tsx'
import { Button } from '@/components/ui/button.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.tsx'
import { Skeleton } from '@/components/ui/skeleton.tsx'
import { useArchivedTickets } from '@/hooks/use-archived-tickets.ts'
import { useTicketMutations } from '@/hooks/use-ticket-mutations.ts'
import { formatWhen } from '@/lib/board-dates.ts'
import { boardPath } from '@/lib/board-links.ts'
import type { NoArgCallback } from '@/lib/callbacks.ts'

interface ArchivedTicketsDialogProps {
  open: boolean
  project: BoardProject
  onClose: NoArgCallback
}

// The tickets taken off this project's board, newest first, each with the way back or out.
export function ArchivedTicketsDialog({
  open,
  project,
  onClose,
}: ArchivedTicketsDialogProps) {
  const { tickets, isPending, error } = useArchivedTickets(project.id, open)
  const { archiveTicket, deleteTicket, isArchiving } = useTicketMutations()
  const [deleting, setDeleting] = useState<ArchivedTicket | null>(null)

  const restore = async (id: number) => {
    try {
      await archiveTicket(id, false)
    } catch {
      // The toast says why.
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Archived tickets</DialogTitle>
          <DialogDescription>
            {project.name}. A restored ticket goes back to the top of its
            column.
          </DialogDescription>
        </DialogHeader>
        {isPending ? (
          <Skeleton className="h-32" />
        ) : error !== null ? (
          <p role="alert" className="text-sm text-destructive">
            {error.message}
          </p>
        ) : tickets.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing archived.</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {tickets.map((ticket) => (
              <li key={ticket.id} className="flex items-center gap-2 py-2">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <Link
                    to={boardPath(project.id, ticket.number)}
                    onClick={() => onClose()}
                    className="truncate text-sm font-medium text-strong hover:underline"
                  >
                    <span className="mr-1.5 font-mono text-[11px] text-muted-foreground">
                      {ticket.key}
                    </span>
                    {ticket.title}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {ticket.columnName} · archived{' '}
                    {formatWhen(ticket.archivedAt)}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isArchiving}
                  onClick={() => void restore(ticket.id)}
                >
                  Restore
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setDeleting(ticket)}
                >
                  Delete…
                </Button>
              </li>
            ))}
          </ul>
        )}
        <ConfirmDeleteDialog
          question={
            deleting === null
              ? null
              : {
                  title: `Delete ${deleting.key}?`,
                  description: 'The ticket and its comments go for good.',
                  confirmLabel: 'Delete ticket',
                }
          }
          onConfirm={() =>
            deleting === null ? Promise.resolve() : deleteTicket(deleting.id)
          }
          onClose={() => setDeleting(null)}
        />
      </DialogContent>
    </Dialog>
  )
}
