import { Plus } from 'lucide-react'
import { useState, type DragEvent } from 'react'

import type { BoardColumn } from '../../../core/types.ts'
import type {
  ColumnActions,
  TicketActions,
} from '@/components/board/board-actions.ts'
import { ColumnLane } from '@/components/board/column-lane.tsx'
import { Button } from '@/components/ui/button.tsx'
import type { NoArgCallback } from '@/lib/callbacks.ts'
import { dropFor, type Drop, type Over } from '@/lib/board-order.ts'

interface BoardLanesProps {
  project: number
  columns: BoardColumn[] // left to right, each with the tickets the filters leave
  ticketActions: TicketActions
  columnActions: ColumnActions
  onAddColumn: NoArgCallback
}

// The lane and card a drag event is over, and which half of the card.
function overAt(event: DragEvent): Over | null {
  // A drag of selected text starts on a text node, which has no closest().
  const { target } = event
  if (!(target instanceof Element)) return null
  const lane = target.closest('[data-column]')
  if (lane === null) return null
  const column = Number(lane.getAttribute('data-column'))
  const card = target.closest('li[data-ticket]')
  if (card === null) return { column, ticket: null, place: 'after' }
  const { top, height } = card.getBoundingClientRect()
  return {
    column,
    ticket: Number(card.getAttribute('data-ticket')),
    place: event.clientY < top + height / 2 ? 'before' : 'after',
  }
}

const sameDrop = (a: Drop | null, b: Drop) =>
  a !== null &&
  a.column === b.column &&
  a.beside === b.beside &&
  a.place === b.place

// The columns side by side, scrolling sideways when they don't fit. A card drags within its lane
// or to another; the line shows where it would land, and nothing is offered where it already is.
export function BoardLanes({
  project,
  columns,
  ticketActions,
  columnActions,
  onAddColumn,
}: BoardLanesProps) {
  const [dragging, setDragging] = useState<number | null>(null)
  const [drop, setDrop] = useState<Drop | null>(null)

  const endDrag = () => {
    setDragging(null)
    setDrop(null)
  }
  const onDragStart = (event: DragEvent) => {
    const card =
      event.target instanceof Element
        ? event.target.closest('li[data-ticket]')
        : null
    if (card === null) return
    setDragging(Number(card.getAttribute('data-ticket')))
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', card.textContent ?? '')
  }
  const onDragOver = (event: DragEvent) => {
    if (dragging === null) return
    const over = overAt(event)
    const next = over === null ? null : dropFor(columns, dragging, over)
    if (next === null) {
      if (drop !== null) setDrop(null)
      return
    }
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    if (!sameDrop(drop, next)) setDrop(next)
  }
  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    if (dragging !== null && drop !== null) ticketActions.move(dragging, drop)
    endDrag()
  }

  return (
    <div
      className="flex items-start gap-3 overflow-x-auto pb-3"
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={endDrag}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setDrop(null)
        }
      }}
    >
      {columns.map((column, index) => (
        <ColumnLane
          key={column.id}
          project={project}
          column={column}
          columns={columns}
          isFirst={index === 0}
          isLast={index === columns.length - 1}
          drop={drop}
          ticketActions={ticketActions}
          columnActions={columnActions}
        />
      ))}
      <Button
        variant="ghost"
        onClick={() => onAddColumn()}
        className="shrink-0 text-muted-foreground"
      >
        <Plus />
        Add column
      </Button>
    </div>
  )
}
