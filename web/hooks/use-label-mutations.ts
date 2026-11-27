import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'

import type { SaveLabel } from '../../core/board/schema.ts'
import type { ActionResult } from '../../core/types.ts'
import { toast } from '@/components/ui/toast-manager.ts'
import { boardKey } from '@/hooks/use-board.ts'
import { postAction } from '@/lib/api.ts'
import { toastFailure } from '@/lib/toast-failure.ts'

interface UseLabelMutationsResult {
  saveLabel: (label: SaveLabel) => Promise<ActionResult>
  deleteLabel: (id: number) => Promise<ActionResult>
}

const success = (result: ActionResult) =>
  toast.add({ title: result.message, type: 'success' })

export function useLabelMutations(): UseLabelMutationsResult {
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: boardKey })
  const save = useMutation({
    mutationFn: (label: SaveLabel) =>
      postAction('/api/board/labels/save', label),
    onSuccess: success,
    onError: (failure) => toastFailure("Couldn't save the label", failure),
    onSettled: refresh,
  })
  const remove = useMutation({
    mutationFn: (id: number) => postAction('/api/board/labels/delete', { id }),
    onSuccess: success,
    onError: (failure) => toastFailure("Couldn't delete the label", failure),
    onSettled: refresh,
  })
  const { mutateAsync: saveLabel } = save
  const { mutateAsync: deleteLabel } = remove
  return useMemo(() => ({ saveLabel, deleteLabel }), [saveLabel, deleteLabel])
}
