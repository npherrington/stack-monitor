import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'

import { toast } from '@/components/ui/toast-manager.ts'
import { postAction } from '@/lib/api.ts'
import { toastFailure } from '@/lib/toast-failure.ts'
import { pullChecksKey, usePullChecks } from '@/hooks/use-pull-checks.ts'
import { pullsKey } from '@/hooks/use-pulls.ts'

interface UseCheckMutationsResult {
  rerunFailed: (run: number) => void
  isRerunning: boolean
  sentRun: number | null // re-run from here, and not yet read back as queued
}

// Re-running a failed Actions run's failed jobs on one PR. Refreshing the checks shows the jobs
// queued, which puts the checks poll back on its short interval; the list's badge changes too.
// GitHub can take a moment to queue the run, so until a read shows it no longer rerunnable it
// stays in sentRun, and its button stays off.
export function useCheckMutations(
  root: string,
  number: number,
): UseCheckMutationsResult {
  const queryClient = useQueryClient()
  const { checks } = usePullChecks(root, number)
  const [sent, setSent] = useState<number | null>(null)
  const waiting =
    sent !== null &&
    (checks?.groups.some(
      (group) => group.run?.id === sent && group.run.rerunnable,
    ) ??
      false)
  if (sent !== null && !waiting) setSent(null)

  const rerun = useMutation({
    mutationFn: (run: number) =>
      postAction('/api/github/checks/rerun', { root, number, run }),
    onSuccess: (result, run) => {
      setSent(run)
      toast.add({
        type: 'success',
        title: 'Failed jobs re-running',
        description: result.message,
      })
    },
    onError: (failure) =>
      toastFailure("Couldn't re-run the failed jobs", failure),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: pullChecksKey(root, number),
        }),
        queryClient.invalidateQueries({ queryKey: pullsKey(root) }),
      ]),
  })
  const { mutate: rerunFailed, isPending: isRerunning } = rerun
  const sentRun = waiting ? sent : null
  return useMemo(
    () => ({ rerunFailed, isRerunning, sentRun }),
    [rerunFailed, isRerunning, sentRun],
  )
}
