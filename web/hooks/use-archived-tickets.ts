import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import type { ArchivedTicket, ArchivedTickets } from '../../core/types.ts'
import { boardKey } from '@/hooks/use-board.ts'
import { getJson } from '@/lib/api.ts'

export const archivedTicketsKey = (project: number) =>
  [...boardKey, 'archived', project] as const

interface UseArchivedTicketsResult {
  tickets: ArchivedTicket[] // most recently archived first
  isPending: boolean
  error: Error | null
}

// A project's archived tickets, read only while their dialog is open.
export function useArchivedTickets(
  project: number,
  enabled: boolean,
): UseArchivedTicketsResult {
  const { data, isPending, error } = useQuery({
    queryKey: archivedTicketsKey(project),
    queryFn: () =>
      getJson<ArchivedTickets>(`/api/board/archived?project=${project}`),
    enabled,
  })
  return useMemo(
    () => ({
      tickets: data?.tickets ?? [],
      isPending: enabled && isPending,
      error: data === undefined ? error : null,
    }),
    [data, isPending, error, enabled],
  )
}
