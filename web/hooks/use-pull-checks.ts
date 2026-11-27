import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import type { PullChecks } from '../../core/types.ts'
import { getJson } from '@/lib/api.ts'
import { githubKey } from '@/hooks/use-pulls.ts'

export const pullChecksKey = (root: string, number: number) =>
  [...githubKey, 'checks', root, number] as const

const RUNNING_MS = 10_000
const SETTLED_MS = 60_000

interface UsePullChecksResult {
  checks: PullChecks | null
  isPending: boolean
  error: Error | null
  isStale: boolean
}

// The CI checks on a PR's head commit. Every 10 s while one is still going, once a minute after; a
// refusal stops it until focus.
export function usePullChecks(
  root: string,
  number: number,
): UsePullChecksResult {
  const { data, isPending, error, isRefetchError } = useQuery({
    queryKey: pullChecksKey(root, number),
    queryFn: () =>
      getJson<PullChecks>(
        `/api/github/checks?root=${encodeURIComponent(root)}&number=${number}`,
      ),
    refetchInterval: (query) => {
      if (query.state.status === 'error') return false
      return query.state.data?.running === true ? RUNNING_MS : SETTLED_MS
    },
  })
  return useMemo(
    () => ({
      checks: data ?? null,
      isPending,
      error: data === undefined ? error : null,
      isStale: isRefetchError,
    }),
    [data, isPending, error, isRefetchError],
  )
}
