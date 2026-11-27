// Relative, not `@/`: tests/board-view.test.ts runs this file under node, which has no alias.
import type { MoveTicket } from '../../core/board/schema.ts'
import type { BoardColumn, TicketSummary } from '../../core/types.ts'

// Where a ticket lands: in a column, before or after another card, or on top when beside is null.
export type Drop = Pick<MoveTicket, 'column' | 'beside' | 'place'>

export interface Over {
  column: number
  ticket: number | null // the card under the pointer; null over the lane's empty space
  place: 'before' | 'after' // which half of that card
}

// Where a dragged card would land among the cards shown, or null when it's already there. The
// columns are what the filters leave, so a drop lands beside a card the user can see.
export function dropFor(
  columns: BoardColumn[],
  dragged: number,
  over: Over,
): Drop | null {
  const lane = columns.find((column) => column.id === over.column)
  if (lane === undefined || over.ticket === dragged) return null
  const shown = lane.tickets.map((ticket) => ticket.id)
  const rest = shown.filter((id) => id !== dragged)
  // Over the lane's empty space: after its last card.
  const beside = over.ticket ?? rest.at(-1) ?? null
  const place = over.ticket === null ? 'after' : over.place
  const at =
    beside === null ? 0 : rest.indexOf(beside) + (place === 'after' ? 1 : 0)
  if (beside !== null && !rest.includes(beside)) return null
  const next = [...rest.slice(0, at), dragged, ...rest.slice(at)]
  if (next.every((id, index) => id === shown[index])) return null
  return beside === null
    ? { column: lane.id, beside: null, place: 'before' }
    : { column: lane.id, beside, place }
}

// One place up or down among the cards shown in its column; null at either end.
export function stepFor(
  tickets: TicketSummary[],
  id: number,
  step: -1 | 1,
): Drop | null {
  const at = tickets.findIndex((ticket) => ticket.id === id)
  const other = at === -1 ? undefined : tickets[at + step]
  if (other === undefined) return null
  return {
    column: other.column,
    beside: other.id,
    place: step < 0 ? 'before' : 'after',
  }
}
