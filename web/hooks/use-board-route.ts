import { useCallback, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router'

import { boardPath, readId } from '@/lib/board-links.ts'
import { readLastProject, storeLastProject } from '@/lib/board-prefs.ts'

interface UseBoardRouteResult {
  projectId: number | null // the project the URL names
  lastProjectId: number | null // with none named: the one this browser opened last
  ticketNumber: number | null // the ticket the URL has open
  openProject: (id: number) => void
  openTicket: (project: number, number: number) => void
  closeTicket: (project: number) => void
  leaveProject: () => void // after it was archived or deleted
}

// Which project and ticket the board shows. The URL decides, so a link opens the same thing and
// Back closes a ticket; the browser only remembers which project a bare /board goes back to.
export function useBoardRoute(): UseBoardRouteResult {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const projectId = readId(params.get('project'))
  const ticketNumber = readId(params.get('ticket'))
  const lastProjectId = projectId === null ? readLastProject() : null

  useEffect(() => {
    if (projectId !== null) storeLastProject(projectId)
  }, [projectId])

  const openProject = useCallback(
    (id: number) => navigate(boardPath(id)),
    [navigate],
  )
  const openTicket = useCallback(
    (project: number, number: number) => navigate(boardPath(project, number)),
    [navigate],
  )
  const closeTicket = useCallback(
    (project: number) => navigate(boardPath(project)),
    [navigate],
  )
  const leaveProject = useCallback(() => {
    storeLastProject(null)
    void navigate('/board')
  }, [navigate])

  return useMemo(
    () => ({
      projectId,
      lastProjectId,
      ticketNumber,
      openProject,
      openTicket,
      closeTicket,
      leaveProject,
    }),
    [
      projectId,
      lastProjectId,
      ticketNumber,
      openProject,
      openTicket,
      closeTicket,
      leaveProject,
    ],
  )
}
