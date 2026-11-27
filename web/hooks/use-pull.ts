import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import type { PullDetail } from '../../core/types.ts'
import { getJson } from '@/lib/api.ts'
import { githubKey } from '@/hooks/use-pulls.ts'

export const pullKey = (root: string, number: number) =>
  [...githubKey, 'pull', root, number] as const

// Someone else's comment or a new push shows within half a minute while the PR is open.
const REFRESH_MS = 30_000

interface UsePullResult {
  pull: PullDetail | null
  isPending: boolean
  error: Error | null
  isStale: boolean
}

// One PR with its files, review threads and the viewer's pending review, as GitHub has them now.
export function usePull(root: string, number: number): UsePullResult {
  const { data, isPending, error, isRefetchError } = useQuery({
    queryKey: pullKey(root, number),
    queryFn: () =>
      getJson<PullDetail>(
        `/api/github/pull?root=${encodeURIComponent(root)}&number=${number}`,
      ),
    refetchInterval: (query) =>
      query.state.status === 'error' ? false : REFRESH_MS,
  })
  return useMemo(
    () => ({
      pull: data ?? null,
      isPending,
      error: data === undefined ? error : null,
      isStale: isRefetchError,
    }),
    [data, isPending, error, isRefetchError],
  )
}
