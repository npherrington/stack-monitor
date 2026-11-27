import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import type { ProjectBoard } from '../../core/types.ts'
import { boardKey } from '@/hooks/use-board.ts'
import { useBoardInterval } from '@/hooks/use-board-interval.ts'
import { getJson } from '@/lib/api.ts'

export const projectBoardKey = (id: number) =>
  [...boardKey, 'project', id] as const

interface UseProjectBoardResult {
  board: ProjectBoard | null
  isPending: boolean
  error: Error | null
  isStale: boolean // the last refresh failed; board is what the one before it read
}

// One project's columns, cards and labels. id null: no project picked yet. It polls only while a
// session started from the board is open (useBoardInterval).
export function useProjectBoard(id: number | null): UseProjectBoardResult {
  const interval = useBoardInterval()
  const { data, isPending, error, isRefetchError } = useQuery({
    queryKey: projectBoardKey(id ?? 0),
    queryFn: () => getJson<ProjectBoard>(`/api/board/project?id=${id ?? 0}`),
    enabled: id !== null,
    refetchInterval: (query) =>
      query.state.status === 'error' ? false : interval,
  })
  return useMemo(
    () => ({
      board: data ?? null,
      isPending: id !== null && isPending,
      error: data === undefined ? error : null,
      isStale: isRefetchError,
    }),
    [data, isPending, error, isRefetchError, id],
  )
}
