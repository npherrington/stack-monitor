// Relative, not `@/`: tests/board-view.test.ts runs this file under node, which has no alias.
import type { Priority, TicketSummary } from '../../core/types.ts'

export interface BoardFilters {
  search: string
  labels: number[] // label ids; a ticket carrying any of them passes
  priorities: Priority[]
}

export const NO_FILTERS: BoardFilters = {
  search: '',
  labels: [],
  priorities: [],
}

export function isFiltering(filters: BoardFilters): boolean {
  return (
    filters.search.trim() !== '' ||
    filters.labels.length > 0 ||
    filters.priorities.length > 0
  )
}

// Its title or id holds the search (BEANS-12, beans-12 or just 12), it carries any of the labels
// picked, and its priority is one of those picked. An empty filter passes everything.
export function matchesTicket(
  ticket: TicketSummary,
  filters: BoardFilters,
): boolean {
  const needle = filters.search.trim().toLowerCase()
  const found =
    needle === '' ||
    ticket.title.toLowerCase().includes(needle) ||
    ticket.key.toLowerCase().includes(needle)
  const labelled =
    filters.labels.length === 0 ||
    ticket.labels.some((label) => filters.labels.includes(label.id))
  const ranked =
    filters.priorities.length === 0 ||
    filters.priorities.includes(ticket.priority)
  return found && labelled && ranked
}
