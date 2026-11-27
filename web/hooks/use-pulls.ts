import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import type { PullList } from '../../core/types.ts'
import { getJson } from '@/lib/api.ts'

export const githubKey = ['github'] as const
export const pullsKey = (root: string) => [...githubKey, 'pulls', root] as const

// Each tick is a gh call against GitHub's rate limit, so once a minute; a refusal (no gh, no
// login, no GitHub remote) won't change on its own, so it stops polling until focus or a reload.
const REFRESH_MS = 60_000

interface UsePullsResult {
  list: PullList | null
  isPending: boolean
  error: Error | null
  isStale: boolean // the last refresh failed; list is what the one before it read
}

// A repo's open PRs, as gh reads them now. root null: no repo picked yet.
export function usePulls(root: string | null): UsePullsResult {
  const { data, isPending, error, isRefetchError } = useQuery({
    queryKey: pullsKey(root ?? ''),
    queryFn: () =>
      getJson<PullList>(
        `/api/github/pulls?root=${encodeURIComponent(root ?? '')}`,
      ),
    enabled: root !== null,
    refetchInterval: (query) =>
      query.state.status === 'error' ? false : REFRESH_MS,
  })
  return useMemo(
    () => ({
      list: data ?? null,
      isPending: root !== null && isPending,
      error: data === undefined ? error : null,
      isStale: isRefetchError,
    }),
    [data, isPending, error, isRefetchError, root],
  )
}
