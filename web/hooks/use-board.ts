import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import type { BoardOverview, BoardProject } from '../../core/types.ts'
import { useBoardInterval } from '@/hooks/use-board-interval.ts'
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

// The board's projects. They change when someone acts, here or in another tab, which the refetch
// on focus shows, and while an agent's session started from the board is open, which is the only
// time this polls. A failed read stops the poll until the next focus or action.
export function useBoard(): UseBoardResult {
  const interval = useBoardInterval()
  const { data, isPending, error, isRefetchError } = useQuery({
    queryKey: boardOverviewKey,
    queryFn: () => getJson<BoardOverview>('/api/board'),
    refetchInterval: (query) =>
      query.state.status === 'error' ? false : interval,
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
