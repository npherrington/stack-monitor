import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'

import type { ActionResult } from '../../core/types.ts'
import { toast } from '@/components/ui/toast-manager.ts'
import { checkoutsKey } from '@/hooks/use-checkouts.ts'
import { postAction } from '@/lib/api.ts'

interface CreateWorktree {
  root: string
  branch: string
}

// Makes a worktree the repo's way. A refusal rejects, for the form to show beside the branch.
export function useCreateWorktree(): {
  createWorktree: (request: CreateWorktree) => Promise<ActionResult>
} {
  const queryClient = useQueryClient()
  const { mutateAsync } = useMutation({
    mutationFn: (request: CreateWorktree) =>
      postAction('/api/worktrees', request),
    onSuccess: (result) =>
      toast.add({
        title: result.message,
        description:
          result.log === null ? undefined : `Install log: ${result.log}`,
        type: 'success',
      }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: checkoutsKey }),
  })
  return useMemo(() => ({ createWorktree: mutateAsync }), [mutateAsync])
}
