import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'

import type {
  DeleteColumn,
  ReorderColumns,
  SaveColumn,
} from '../../core/board/schema.ts'
import type { ActionResult } from '../../core/types.ts'
import { toast } from '@/components/ui/toast-manager.ts'
import { boardKey } from '@/hooks/use-board.ts'
import { postAction } from '@/lib/api.ts'
import { toastFailure } from '@/lib/toast-failure.ts'

interface UseColumnMutationsResult {
  saveColumn: (column: SaveColumn) => Promise<ActionResult>
  recolourColumn: (column: SaveColumn) => void // from the column's menu: the lane shows it
  reorderColumns: (order: ReorderColumns) => void
  deleteColumn: (column: DeleteColumn) => Promise<ActionResult>
}

const success = (result: ActionResult) =>
  toast.add({ title: result.message, type: 'success' })

export function useColumnMutations(): UseColumnMutationsResult {
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: boardKey })
  const save = useMutation({
    mutationFn: (column: SaveColumn) =>
      postAction('/api/board/columns/save', column),
    onSuccess: success,
    onError: (failure) => toastFailure("Couldn't save the column", failure),
    onSettled: refresh,
  })
  const recolour = useMutation({
    mutationFn: (column: SaveColumn) =>
      postAction('/api/board/columns/save', column),
    onError: (failure) => toastFailure("Couldn't recolour the column", failure),
    onSettled: refresh,
  })
  const reorder = useMutation({
    mutationFn: (order: ReorderColumns) =>
      postAction('/api/board/columns/reorder', order),
    onError: (failure) => toastFailure("Couldn't move the column", failure),
    onSettled: refresh,
  })
  const remove = useMutation({
    mutationFn: (column: DeleteColumn) =>
      postAction('/api/board/columns/delete', column),
    onSuccess: success,
    onError: (failure) => toastFailure("Couldn't delete the column", failure),
    onSettled: refresh,
  })

  const { mutateAsync: saveColumn } = save
  const { mutate: recolourColumn } = recolour
  const { mutate: reorderColumns } = reorder
  const { mutateAsync: deleteColumn } = remove
  return useMemo(
    () => ({ saveColumn, recolourColumn, reorderColumns, deleteColumn }),
    [saveColumn, recolourColumn, reorderColumns, deleteColumn],
  )
}
