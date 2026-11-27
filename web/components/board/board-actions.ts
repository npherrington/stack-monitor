import type {
  BoardColour,
  BoardColumn,
  Priority,
  TicketSummary,
} from '../../../core/types.ts'
import type { Drop } from '@/lib/board-order.ts'

// What a card's menu and a drag can do to a ticket. The board view owns them, so one set of
// mutations serves every card.
export interface TicketActions {
  move: (ticket: number, drop: Drop) => void
  setPriority: (ticket: number, priority: Priority) => void
  archive: (ticket: TicketSummary) => void
  remove: (ticket: TicketSummary) => void // asks first
}

// What a lane's header can do to its column.
export interface ColumnActions {
  addTicket: (column: BoardColumn) => void
  edit: (column: BoardColumn) => void
  recolour: (column: BoardColumn, colour: BoardColour | null) => void
  shift: (column: BoardColumn, step: -1 | 1) => void
  remove: (column: BoardColumn) => void // asks first
}
