import { useCallback, useMemo } from 'react'

import type { SaveProject } from '../../core/board/schema.ts'
import { useBoardRoute } from '@/hooks/use-board-route.ts'
import { useProjectMutations } from '@/hooks/use-project-mutations.ts'
import { useTicketMutations } from '@/hooks/use-ticket-mutations.ts'

interface TicketRef {
  id: number
  project: number
}

interface UseBoardFlowResult {
  createProject: (project: SaveProject) => Promise<void>
  shelveProject: (id: number) => Promise<void>
  removeProject: (id: number) => Promise<void>
  shelveTicket: (ticket: TicketRef) => Promise<void>
  removeTicket: (ticket: TicketRef) => Promise<void>
  isShelving: boolean // a project or a ticket is being archived
}

// The board's actions that end somewhere else: a new project opens, an archived or deleted one is
// left, and an archived or deleted ticket's dialog closes. Each rejects when the action failed,
// after the mutation's own toast, so the dialog that asked stays open.
export function useBoardFlow(): UseBoardFlowResult {
  const { openProject, leaveProject, closeTicket } = useBoardRoute()
  const {
    saveProject,
    archiveProject,
    deleteProject,
    isArchiving: isShelvingProject,
  } = useProjectMutations()
  const {
    archiveTicket,
    deleteTicket,
    isArchiving: isShelvingTicket,
  } = useTicketMutations()
  const isShelving = isShelvingProject || isShelvingTicket

  const createProject = useCallback(
    async (project: SaveProject) => {
      const { id } = await saveProject(project)
      if (id !== null) openProject(id)
    },
    [saveProject, openProject],
  )
  const shelveProject = useCallback(
    async (id: number) => {
      await archiveProject(id, true)
      leaveProject()
    },
    [archiveProject, leaveProject],
  )
  const removeProject = useCallback(
    async (id: number) => {
      await deleteProject(id)
      leaveProject()
    },
    [deleteProject, leaveProject],
  )
  const shelveTicket = useCallback(
    async ({ id, project }: TicketRef) => {
      await archiveTicket(id, true)
      closeTicket(project)
    },
    [archiveTicket, closeTicket],
  )
  const removeTicket = useCallback(
    async ({ id, project }: TicketRef) => {
      await deleteTicket(id)
      closeTicket(project)
    },
    [deleteTicket, closeTicket],
  )

  return useMemo(
    () => ({
      createProject,
      shelveProject,
      removeProject,
      shelveTicket,
      removeTicket,
      isShelving,
    }),
    [
      createProject,
      shelveProject,
      removeProject,
      shelveTicket,
      removeTicket,
      isShelving,
    ],
  )
}
