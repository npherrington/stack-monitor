import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import type { CheckoutsSnapshot, RepoCheckouts } from '../../core/types.ts'
import { getJson } from '@/lib/api.ts'

export const checkoutsKey = ['checkouts'] as const

// Git state changes under the page (a commit in a terminal, an agent's edits), and each read is a
// fresh look at git, so it refreshes on focus and every 15 seconds while the tab is visible.
const REFRESH_MS = 15_000

interface UseCheckoutsResult {
  repos: RepoCheckouts[]
  isPending: boolean
  error: Error | null
  isStale: boolean // the last refresh failed; repos is what the one before it read
}

export function useCheckouts(): UseCheckoutsResult {
  const { data, isPending, error, isRefetchError } = useQuery({
    queryKey: checkoutsKey,
    queryFn: () => getJson<CheckoutsSnapshot>('/api/checkouts'),
    refetchInterval: REFRESH_MS,
  })
  return useMemo(
    () => ({
      repos: data?.repos ?? [],
      isPending,
      error: data === undefined ? error : null,
      isStale: isRefetchError,
    }),
    [data, isPending, error, isRefetchError],
  )
}
