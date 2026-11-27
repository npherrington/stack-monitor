import { useCallback, useMemo, useState } from 'react'

import type { BoardColumn, Priority, ProjectBoard } from '../../core/types.ts'
import {
  isFiltering,
  matchesTicket,
  NO_FILTERS,
  type BoardFilters,
} from '@/lib/board-filter.ts'

interface UseBoardFiltersResult {
  filters: BoardFilters
  isFiltering: boolean
  setSearch: (search: string) => void
  toggleLabel: (id: number) => void
  togglePriority: (priority: Priority) => void
  clear: () => void
  columns: BoardColumn[] // the board's, each with only the tickets that match
  hidden: number // tickets the search and filters leave out
}

function toggled<T>(list: T[], item: T): T[] {
  return list.includes(item)
    ? list.filter((each) => each !== item)
    : [...list, item]
}

// The board's search box and its label and priority filters, and the columns they leave. Kept
// while the project is open and gone on a reload: a filter that came back unasked would hide
// tickets with nothing on the page saying why.
export function useBoardFilters(
  board: ProjectBoard | null,
): UseBoardFiltersResult {
  const [filters, setFilters] = useState(NO_FILTERS)
  const setSearch = useCallback(
    (search: string) => setFilters((now) => ({ ...now, search })),
    [],
  )
  const toggleLabel = useCallback(
    (id: number) =>
      setFilters((now) => ({ ...now, labels: toggled(now.labels, id) })),
    [],
  )
  const togglePriority = useCallback(
    (priority: Priority) =>
      setFilters((now) => ({
        ...now,
        priorities: toggled(now.priorities, priority),
      })),
    [],
  )
  const clear = useCallback(() => setFilters(NO_FILTERS), [])

  const columns = useMemo(
    () =>
      (board?.columns ?? []).map((column) => ({
        ...column,
        tickets: column.tickets.filter((ticket) =>
          matchesTicket(ticket, filters),
        ),
      })),
    [board, filters],
  )
  const total = (board?.columns ?? []).reduce(
    (sum, column) => sum + column.tickets.length,
    0,
  )
  const shown = columns.reduce((sum, column) => sum + column.tickets.length, 0)
  const hidden = total - shown
  const active = isFiltering(filters)

  return useMemo(
    () => ({
      filters,
      isFiltering: active,
      setSearch,
      toggleLabel,
      togglePriority,
      clear,
      columns,
      hidden,
    }),
    [
      filters,
      active,
      setSearch,
      toggleLabel,
      togglePriority,
      clear,
      columns,
      hidden,
    ],
  )
}
