import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import type { BoardOverview, BoardProject } from '../../core/types.ts'
import { getJson } from '@/lib/api.ts'

// Every board query's key starts here, so one invalidation after an action refreshes them all.
export const boardKey = ['board'] as const
export const boardOverviewKey = [...boardKey, 'overview'] as const

interface UseBoardResult {
  projects: BoardProject[] // unarchived first
  isPending: boolean
  error: Error | null
  isStale: boolean // the last refresh failed; projects is what the one before it read
}

// The board's projects. No interval: they change only when someone acts, here or in another tab,
// and the refetch on focus shows the other tab's change.
export function useBoard(): UseBoardResult {
  const { data, isPending, error, isRefetchError } = useQuery({
    queryKey: boardOverviewKey,
    queryFn: () => getJson<BoardOverview>('/api/board'),
  })
  return useMemo(
    () => ({
      projects: data?.projects ?? [],
      isPending,
      error: data === undefined ? error : null,
      isStale: isRefetchError,
    }),
    [data, isPending, error, isRefetchError],
  )
}
