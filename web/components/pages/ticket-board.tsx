import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import { ArchivedProjectsDialog } from '@/components/board/archived-projects-dialog.tsx'
import { BoardView } from '@/components/board/board-view.tsx'
import { ProjectDialog } from '@/components/board/project-dialog.tsx'
import { ProjectPicker } from '@/components/board/project-picker.tsx'
import { TicketDialog } from '@/components/board/ticket-dialog.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Skeleton } from '@/components/ui/skeleton.tsx'
import { useBoard } from '@/hooks/use-board.ts'
import { useBoardRoute } from '@/hooks/use-board-route.ts'
import { useProjectMutations } from '@/hooks/use-project-mutations.ts'
import { quietly } from '@/lib/quietly.ts'

// The ticket board: one project's board at a time, picked in the header. The URL names the
// project and the open ticket; a bare /board goes back to the project this browser last showed.
export function TicketBoard() {
  const { projects, isPending, error, isStale } = useBoard()
  const { projectId, lastProjectId, ticketNumber, openProject, closeTicket } =
    useBoardRoute()
  const { archiveProject, isArchiving } = useProjectMutations()
  const [dialog, setDialog] = useState<'new' | 'archived' | null>(null)

  const active = projects.filter((project) => !project.archived)
  const archived = projects.filter((project) => project.archived)
  const current =
    projectId === null
      ? (active.find((project) => project.id === lastProjectId) ?? active[0])
      : projects.find((project) => project.id === projectId)

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold text-strong">Ticket board</h1>
          <p className="text-muted-foreground">
            A board of tickets per project: drag a card to the column it's in
            now.
          </p>
        </div>
        {projects.length > 0 && (
          <ProjectPicker
            projects={active}
            current={current ?? null}
            archived={archived.length}
            onPick={openProject}
            onNew={() => setDialog('new')}
            onShowArchived={() => setDialog('archived')}
          />
        )}
      </header>
      {isStale && (
        <p className="text-xs text-warning" role="status">
          Couldn't refresh the projects; showing the last read
        </p>
      )}
      {isPending ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-8 w-80" />
          <div className="flex gap-3">
            {['a', 'b', 'c', 'd'].map((lane) => (
              <Skeleton key={lane} className="h-72 w-64 shrink-0" />
            ))}
          </div>
        </div>
      ) : error !== null ? (
        <p role="alert" className="whitespace-pre-wrap text-destructive">
          {error.message}
        </p>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-2xl bg-card p-6 ring-1 ring-foreground/10">
          <h2 className="text-sm font-semibold text-strong">No projects yet</h2>
          <p className="max-w-prose text-sm text-muted-foreground">
            A project is a board of its own: columns you name, and tickets
            numbered with a prefix you choose, like BEANS-12.
          </p>
          <Button onClick={() => setDialog('new')}>
            <Plus />
            New project
          </Button>
        </div>
      ) : current === undefined && projectId !== null ? (
        <p className="text-muted-foreground">
          There's no project {projectId}.{' '}
          <Link to="/board" className="font-semibold underline">
            Show another project
          </Link>
          .
        </p>
      ) : current === undefined ? (
        <div className="flex flex-col items-start gap-3 rounded-2xl bg-card p-6 ring-1 ring-foreground/10">
          <h2 className="text-sm font-semibold text-strong">
            Every project is archived
          </h2>
          <div className="flex gap-2">
            <Button onClick={() => setDialog('new')}>
              <Plus />
              New project
            </Button>
            <Button variant="outline" onClick={() => setDialog('archived')}>
              Archived projects
            </Button>
          </div>
        </div>
      ) : current.archived ? (
        <div className="flex flex-col items-start gap-3 rounded-2xl bg-card p-6 ring-1 ring-foreground/10">
          <h2 className="text-sm font-semibold text-strong">{current.name}</h2>
          <p className="text-sm text-muted-foreground">
            This project is archived. Restore it to see its board.
          </p>
          <Button
            disabled={isArchiving}
            onClick={() => quietly(archiveProject(current.id, false))}
          >
            Restore
          </Button>
        </div>
      ) : (
        <>
          <BoardView key={current.id} project={current} />
          <TicketDialog
            project={current}
            number={ticketNumber}
            onClose={() => closeTicket(current.id)}
          />
        </>
      )}
      <ProjectDialog
        open={dialog === 'new'}
        project={null}
        onClose={() => setDialog(null)}
      />
      <ArchivedProjectsDialog
        open={dialog === 'archived'}
        projects={archived}
        onClose={() => setDialog(null)}
      />
    </div>
  )
}
