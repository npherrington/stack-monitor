import { useState } from 'react'

import { countOf } from '../../../core/board/schema.ts'
import type { BoardProject } from '../../../core/types.ts'
import { ColourDot } from '@/components/board/colour-dot.tsx'
import { ConfirmDeleteDialog } from '@/components/board/confirm-delete-dialog.tsx'
import { deleteProjectQuestion } from '@/components/board/delete-project.ts'
import { Button } from '@/components/ui/button.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.tsx'
import { useProjectMutations } from '@/hooks/use-project-mutations.ts'
import type { NoArgCallback } from '@/lib/callbacks.ts'

interface ArchivedProjectsDialogProps {
  open: boolean
  projects: BoardProject[] // the archived ones
  onClose: NoArgCallback
}

export function ArchivedProjectsDialog({
  open,
  projects,
  onClose,
}: ArchivedProjectsDialogProps) {
  const { archiveProject, deleteProject, isArchiving } = useProjectMutations()
  const [deleting, setDeleting] = useState<BoardProject | null>(null)

  const restore = async (id: number) => {
    try {
      await archiveProject(id, false)
    } catch {
      // The toast says why.
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Archived projects</DialogTitle>
          <DialogDescription>
            Restoring one brings its board back as it was.
          </DialogDescription>
        </DialogHeader>
        {projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No project is archived.
          </p>
        ) : (
          <ul className="flex flex-col divide-y">
            {projects.map((project) => (
              <li key={project.id} className="flex items-center gap-2 py-2">
                <ColourDot colour={project.colour} />
                <span className="min-w-0 flex-1 truncate text-sm">
                  {project.name}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {countOf(project.tickets + project.archivedTickets, 'ticket')}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isArchiving}
                  onClick={() => void restore(project.id)}
                >
                  Restore
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setDeleting(project)}
                >
                  Delete…
                </Button>
              </li>
            ))}
          </ul>
        )}
        <ConfirmDeleteDialog
          question={deleting === null ? null : deleteProjectQuestion(deleting)}
          onConfirm={() =>
            deleting === null ? Promise.resolve() : deleteProject(deleting.id)
          }
          onClose={() => setDeleting(null)}
        />
      </DialogContent>
    </Dialog>
  )
}
