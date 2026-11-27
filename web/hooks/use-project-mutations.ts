import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'

import type { SaveProject } from '../../core/board/schema.ts'
import type {
  ActionResult,
  BoardOverview,
  SaveProjectResult,
} from '../../core/types.ts'
import { toast } from '@/components/ui/toast-manager.ts'
import { boardKey, boardOverviewKey } from '@/hooks/use-board.ts'
import { postAction, postJson } from '@/lib/api.ts'
import { toastFailure } from '@/lib/toast-failure.ts'

interface UseProjectMutationsResult {
  saveProject: (project: SaveProject) => Promise<SaveProjectResult>
  archiveProject: (id: number, archived: boolean) => Promise<ActionResult>
  deleteProject: (id: number) => Promise<ActionResult>
  isArchiving: boolean // an archive or a restore is on its way
}

const success = (result: ActionResult) =>
  toast.add({ title: result.message, type: 'success' })

// Creating, saving, archiving and deleting a project. Each says once how it went, and a caller
// that awaits one catches the failure only to keep its dialog open.
export function useProjectMutations(): UseProjectMutationsResult {
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: boardKey })
  const save = useMutation({
    mutationFn: (project: SaveProject) =>
      postJson<SaveProjectResult>('/api/board/projects/save', project),
    onSuccess: success,
    onError: (failure) => toastFailure("Couldn't save the project", failure),
    onSettled: refresh,
  })
  const archive = useMutation({
    mutationFn: (change: { id: number; archived: boolean }) =>
      postAction('/api/board/projects/archive', change),
    onSuccess: success,
    onError: (failure) => toastFailure("Couldn't change the project", failure),
    onSettled: refresh,
  })
  const remove = useMutation({
    mutationFn: (id: number) =>
      postAction('/api/board/projects/delete', { id }),
    onSuccess: (result, id) => {
      success(result)
      // Out of the list now, so the page doesn't open the board of a project that's gone while
      // the list is read again.
      queryClient.setQueryData<BoardOverview>(boardOverviewKey, (overview) =>
        overview === undefined
          ? overview
          : {
              projects: overview.projects.filter((each) => each.id !== id),
            },
      )
    },
    onError: (failure) => toastFailure("Couldn't delete the project", failure),
    // Everything but the deleted project's own board, which would only be found gone.
    onSettled: (_result, _failure, id) =>
      queryClient.invalidateQueries({
        queryKey: boardKey,
        predicate: (query) =>
          !(query.queryKey[1] === 'project' && query.queryKey[2] === id),
      }),
  })

  const { mutateAsync: saveProject } = save
  const { mutateAsync: archiveMutate, isPending: isArchiving } = archive
  const { mutateAsync: deleteProject } = remove
  return useMemo(
    () => ({
      saveProject,
      archiveProject: (id: number, archived: boolean) =>
        archiveMutate({ id, archived }),
      deleteProject,
      isArchiving,
    }),
    [saveProject, archiveMutate, deleteProject, isArchiving],
  )
}
