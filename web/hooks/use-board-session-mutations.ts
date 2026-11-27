import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'

import type { TerminalSession } from '../../core/types.ts'
import { toast } from '@/components/ui/toast-manager.ts'
import { checkoutsKey } from '@/hooks/use-checkouts.ts'
import { terminalsKey } from '@/hooks/use-terminals.ts'
import { postSession } from '@/lib/api.ts'
import { toastFailure } from '@/lib/toast-failure.ts'

// POST /api/board/work: the ticket by its project and number, and where the session runs.
export interface WorkTicketStart {
  project: number
  number: number
  root: string
  where: { kind: 'new'; branch: string } | { kind: 'existing'; path: string }
  skill: string | null
}

// POST /api/board/product
export interface ProductSessionStart {
  project: number
  root: string
  path: string
}

interface UseBoardSessionMutationsResult {
  workTicket: (request: WorkTicketStart) => Promise<TerminalSession>
  startProduct: (request: ProductSessionStart) => Promise<TerminalSession>
}

// The Claude Code sessions the board starts. Each opens a terminal session, and working a ticket
// may make a worktree, so both lists are read again after it, whether or not it went through.
export function useBoardSessionMutations(): UseBoardSessionMutationsResult {
  const queryClient = useQueryClient()
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: terminalsKey }),
      queryClient.invalidateQueries({ queryKey: checkoutsKey }),
    ])
  const work = useMutation({
    mutationFn: (request: WorkTicketStart) =>
      postSession('/api/board/work', request),
    onSuccess: (result) =>
      toast.add({
        title: 'Session opened',
        description: result.message,
        type: 'success',
      }),
    onError: (failure) => toastFailure("Couldn't start the session", failure),
    onSettled: refresh,
  })
  const product = useMutation({
    mutationFn: (request: ProductSessionStart) =>
      postSession('/api/board/product', request),
    onSuccess: (result) =>
      toast.add({
        title: 'Product management opened',
        description: result.message,
        type: 'success',
      }),
    onError: (failure) => toastFailure("Couldn't start the session", failure),
    onSettled: refresh,
  })

  const { mutateAsync: openWork } = work
  const { mutateAsync: openProduct } = product
  const workTicket = useCallback(
    async (request: WorkTicketStart) => (await openWork(request)).session,
    [openWork],
  )
  const startProduct = useCallback(
    async (request: ProductSessionStart) =>
      (await openProduct(request)).session,
    [openProduct],
  )
  return useMemo(
    () => ({ workTicket, startProduct }),
    [workTicket, startProduct],
  )
}
