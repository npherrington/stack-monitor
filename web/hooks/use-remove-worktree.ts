import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'

import type { ActionResult } from '../../core/types.ts'
import { toast } from '@/components/ui/toast-manager.ts'
import { checkoutsKey } from '@/hooks/use-checkouts.ts'
import { postAction } from '@/lib/api.ts'

interface RemoveWorktree {
  root: string
  path: string
  deleteBranch: boolean
}

// Removes a linked worktree. A refusal rejects, for the dialog to show.
export function useRemoveWorktree(): {
  removeWorktree: (request: RemoveWorktree) => Promise<ActionResult>
  isRemoving: boolean
} {
  const queryClient = useQueryClient()
  const { mutateAsync, isPending } = useMutation({
    mutationFn: (request: RemoveWorktree) =>
      postAction('/api/worktrees/remove', request),
    onSuccess: (result) =>
      toast.add({ title: result.message, type: 'success' }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: checkoutsKey }),
  })
  return useMemo(
    () => ({ removeWorktree: mutateAsync, isRemoving: isPending }),
    [mutateAsync, isPending],
  )
}
