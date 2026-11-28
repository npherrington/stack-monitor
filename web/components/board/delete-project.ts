import { countOf } from '../../../core/board/schema.ts'
import type { BoardProject } from '../../../core/types.ts'
import type { DeleteQuestion } from '@/components/ui/confirm-delete-dialog.tsx'

// What deleting a project takes with it, said before it's done.
export function deleteProjectQuestion(project: BoardProject): DeleteQuestion {
  const all = project.tickets + project.archivedTickets
  const title =
    all === 0
      ? `Delete ${project.name}?`
      : `Delete ${project.name} and its ${countOf(all, 'ticket')}?`
  const archived =
    project.archivedTickets === 0
      ? ''
      : ` ${project.archivedTickets} of them ${project.archivedTickets === 1 ? 'is' : 'are'} archived.`
  return {
    title,
    description: `Its columns, tickets, comments and its own labels go for good.${archived} Shared labels stay. Archive it instead to keep it out of the way.`,
    confirmLabel: 'Delete project',
  }
}
