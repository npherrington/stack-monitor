import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import type { TicketDetail } from '../../core/types.ts'
import { boardKey } from '@/hooks/use-board.ts'
import { ApiError, getJson } from '@/lib/api.ts'

export const boardTicketKey = (project: number, number: number) =>
  [...boardKey, 'ticket', project, number] as const

interface UseTicketResult {
  ticket: TicketDetail | null
  isPending: boolean
  error: Error | null
}

// One ticket with its description and comments. number null: no ticket is open.
export function useTicket(
  project: number,
  number: number | null,
): UseTicketResult {
  const { data, isPending, error } = useQuery({
    queryKey: boardTicketKey(project, number ?? 0),
    queryFn: () =>
      getJson<TicketDetail>(
        `/api/board/ticket?project=${project}&number=${number ?? 0}`,
      ),
    enabled: number !== null,
  })
  // A ticket deleted since it was last read: the copy kept from then isn't shown as if it were
  // still there (Back onto a deleted ticket's link reads it from the cache first).
  const isGone = error instanceof ApiError && error.status === 404
  return useMemo(
    () => ({
      ticket: isGone ? null : (data ?? null),
      isPending: number !== null && isPending,
      error: data === undefined || isGone ? error : null,
    }),
    [data, isPending, error, number, isGone],
  )
}
