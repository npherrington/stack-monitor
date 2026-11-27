import { Plus } from 'lucide-react'
import { useState } from 'react'

import type {
  BoardColumn,
  BoardProject,
  TicketSummary,
} from '../../../core/types.ts'
import { ArchivedTicketsDialog } from '@/components/board/archived-tickets-dialog.tsx'
import type {
  ColumnActions,
  TicketActions,
} from '@/components/board/board-actions.ts'
import { BoardLanes } from '@/components/board/board-lanes.tsx'
import { BoardToolbar } from '@/components/board/board-toolbar.tsx'
import { ColumnDialog } from '@/components/board/column-dialog.tsx'
import { ConfirmDeleteDialog } from '@/components/board/confirm-delete-dialog.tsx'
import { DeleteColumnDialog } from '@/components/board/delete-column-dialog.tsx'
import { deleteProjectQuestion } from '@/components/board/delete-project.ts'
import { LabelsDialog } from '@/components/board/labels-dialog.tsx'
import { NewTicketDialog } from '@/components/board/new-ticket-dialog.tsx'
import { ProjectDialog } from '@/components/board/project-dialog.tsx'
import { ProjectMenu } from '@/components/board/project-menu.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Skeleton } from '@/components/ui/skeleton.tsx'
import { useBoardFilters } from '@/hooks/use-board-filters.ts'
import { useBoardFlow } from '@/hooks/use-board-flow.ts'
import { useColumnMutations } from '@/hooks/use-column-mutations.ts'
import { useProjectBoard } from '@/hooks/use-project-board.ts'
import { useTicketMutations } from '@/hooks/use-ticket-mutations.ts'
import { quietly } from '@/lib/quietly.ts'

interface BoardViewProps {
  project: BoardProject
}

type Open = 'edit' | 'labels' | 'archived' | 'delete' | null

// One project's board: the search and filters, the lanes, and every dialog its menus open.
export function BoardView({ project }: BoardViewProps) {
  const { board, isPending, error, isStale } = useProjectBoard(project.id)
  const view = useBoardFilters(board)
  const { shelveProject, removeProject, removeTicket } = useBoardFlow()
  const { updateTicket, moveTicket, archiveTicket } = useTicketMutations()
  const { recolourColumn, reorderColumns } = useColumnMutations()
  const [open, setOpen] = useState<Open>(null)
  const [newTicketIn, setNewTicketIn] = useState<number | null>(null)
  const [columnTarget, setColumnTarget] = useState<BoardColumn | 'new' | null>(
    null,
  )
  const [deletingColumn, setDeletingColumn] = useState<BoardColumn | null>(null)
  const [deletingTicket, setDeletingTicket] = useState<TicketSummary | null>(
    null,
  )

  if (isPending) {
    return (
      <div className="flex gap-3">
        {['a', 'b', 'c', 'd'].map((lane) => (
          <Skeleton key={lane} className="h-72 w-64 shrink-0" />
        ))}
      </div>
    )
  }
  if (board === null) {
    return (
      <p role="alert" className="text-destructive">
        {error?.message ?? "Couldn't read the board"}
      </p>
    )
  }

  const ticketActions: TicketActions = {
    move: (ticket, drop) => moveTicket({ id: ticket, ...drop }),
    setPriority: (ticket, priority) => updateTicket({ id: ticket, priority }),
    archive: (ticket) => quietly(archiveTicket(ticket.id, true)),
    remove: setDeletingTicket,
  }
  const columnActions: ColumnActions = {
    addTicket: (column) => setNewTicketIn(column.id),
    edit: setColumnTarget,
    recolour: (column, colour) =>
      recolourColumn({
        id: column.id,
        project: project.id,
        name: column.name,
        colour,
      }),
    shift: (column, step) => {
      const order = board.columns.map((each) => each.id)
      const at = order.indexOf(column.id)
      const swap = at + step
      if (at === -1 || swap < 0 || swap >= order.length) return
      order[at] = order[swap]
      order[swap] = column.id
      reorderColumns({ project: project.id, order })
    },
    // The board's own column, with every ticket: the filters may be hiding some of its cards.
    remove: (column) =>
      setDeletingColumn(
        board.columns.find((each) => each.id === column.id) ?? column,
      ),
  }
  const total = board.project.tickets
  const [first] = board.columns

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <BoardToolbar
          filters={view.filters}
          isFiltering={view.isFiltering}
          labels={board.labels}
          onSearch={view.setSearch}
          onToggleLabel={view.toggleLabel}
          onTogglePriority={view.togglePriority}
          onClear={view.clear}
        />
        <div className="ml-auto flex items-center gap-2">
          <Button onClick={() => setNewTicketIn(first.id)}>
            <Plus />
            New ticket
          </Button>
          <ProjectMenu
            project={board.project}
            onEdit={() => setOpen('edit')}
            onLabels={() => setOpen('labels')}
            onArchivedTickets={() => setOpen('archived')}
            onArchive={() => quietly(shelveProject(project.id))}
            onDelete={() => setOpen('delete')}
          />
        </div>
      </div>
      {isStale && (
        <p className="text-xs text-warning" role="status">
          Couldn't refresh; showing the last read
        </p>
      )}
      {total === 0 ? (
        <p className="text-sm text-muted-foreground">
          No tickets yet. New ticket adds the first to {first.name}.
        </p>
      ) : view.hidden === total ? (
        <p className="text-sm text-muted-foreground">
          No tickets match the search and filters.{' '}
          <Button variant="link" size="xs" onClick={() => view.clear()}>
            Clear them
          </Button>
        </p>
      ) : (
        view.hidden > 0 && (
          <p className="text-xs text-muted-foreground">
            {view.hidden} hidden by the search or filters
          </p>
        )
      )}
      <BoardLanes
        project={project.id}
        columns={view.columns}
        ticketActions={ticketActions}
        columnActions={columnActions}
        onAddColumn={() => setColumnTarget('new')}
      />
      <NewTicketDialog
        board={board}
        column={newTicketIn}
        onClose={() => setNewTicketIn(null)}
      />
      <ColumnDialog
        project={project.id}
        target={columnTarget}
        onClose={() => setColumnTarget(null)}
      />
      <DeleteColumnDialog
        column={deletingColumn}
        columns={board.columns}
        hasArchived={board.project.archivedTickets > 0}
        onClose={() => setDeletingColumn(null)}
      />
      <ProjectDialog
        open={open === 'edit'}
        project={board.project}
        onClose={() => setOpen(null)}
      />
      <LabelsDialog
        open={open === 'labels'}
        project={board.project}
        labels={board.labels}
        onClose={() => setOpen(null)}
      />
      <ArchivedTicketsDialog
        open={open === 'archived'}
        project={board.project}
        onClose={() => setOpen(null)}
      />
      <ConfirmDeleteDialog
        question={
          open === 'delete' ? deleteProjectQuestion(board.project) : null
        }
        onConfirm={() => removeProject(project.id)}
        onClose={() => setOpen(null)}
      />
      <ConfirmDeleteDialog
        question={
          deletingTicket === null
            ? null
            : {
                title: `Delete ${deletingTicket.key}?`,
                description:
                  'The ticket and its comments go for good. Archive it instead to keep it off the board.',
                confirmLabel: 'Delete ticket',
              }
        }
        onConfirm={() =>
          deletingTicket === null
            ? Promise.resolve()
            : removeTicket({ id: deletingTicket.id, project: project.id })
        }
        onClose={() => setDeletingTicket(null)}
      />
    </div>
  )
}
