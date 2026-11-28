import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'

import type { ActionResult, StackMap } from '../../core/types.ts'
import { toast } from '@/components/ui/toast-manager.ts'
import { featureMapKey } from '@/hooks/use-feature-map.ts'
import { stackMapKey } from '@/hooks/use-stack-map.ts'
import { postAction } from '@/lib/api.ts'
import { toastFailure } from '@/lib/toast-failure.ts'

interface SaveMap {
  name: string // the file it's saved to
  map: StackMap
  replacing: string | null // the file it was opened from, when that's another name
}

interface UseStackMapMutationsResult {
  saveMap: (save: SaveMap) => Promise<ActionResult>
  deleteMap: (name: string) => Promise<ActionResult>
  isSaving: boolean
  isDeleting: boolean
}

const success = (result: ActionResult) =>
  toast.add({ title: result.message, type: 'success' })

// Saving and deleting a repo's maps. Each says once how it went; a caller that awaits one catches
// the failure only to keep its dialog open.
export function useStackMapMutations(root: string): UseStackMapMutationsResult {
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationFn: ({ name, map, replacing }: SaveMap) =>
      postAction('/api/feature-map/save', {
        root,
        name,
        map,
        replacing: replacing ?? undefined,
      }),
    onSuccess: success,
    onError: (failure) => toastFailure("Couldn't save the map", failure),
    onSettled: (_result, _failure, { name }) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: featureMapKey(root) }),
        queryClient.invalidateQueries({ queryKey: stackMapKey(root, name) }),
      ]),
  })
  const remove = useMutation({
    mutationFn: (name: string) =>
      postAction('/api/feature-map/delete', { root, name }),
    onSuccess: success,
    onError: (failure) => toastFailure("Couldn't delete the map", failure),
    // Only the list: the deleted map's own query would be refetched into a 404 while it's still
    // on screen.
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: featureMapKey(root) }),
  })

  const { mutateAsync: saveMap, isPending: isSaving } = save
  const { mutateAsync: deleteMap, isPending: isDeleting } = remove
  return useMemo(
    () => ({ saveMap, deleteMap, isSaving, isDeleting }),
    [saveMap, deleteMap, isSaving, isDeleting],
  )
}
