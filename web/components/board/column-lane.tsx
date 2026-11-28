import { Plus } from 'lucide-react'

import type { BoardColumn } from '../../../core/types.ts'
import type {
  ColumnActions,
  TicketActions,
} from '@/components/board/board-actions.ts'
import { ColourDot } from '@/components/board/colour-dot.tsx'
import { ColumnMenu } from '@/components/board/column-menu.tsx'
import { TicketCard } from '@/components/board/ticket-card.tsx'
import { Button } from '@/components/ui/button.tsx'
import { swatchSurface } from '@/components/ui/swatch-variants.ts'
import { Tip } from '@/components/ui/tooltip.tsx'
import type { Drop } from '@/lib/board-order.ts'
import { cn } from '@/lib/utils.ts'

interface ColumnLaneProps {
  project: number
  column: BoardColumn // with the tickets the filters leave
  columns: BoardColumn[]
  isFirst: boolean
  isLast: boolean
  drop: Drop | null // where the card being dragged would land, in any lane
  ticketActions: TicketActions
  columnActions: ColumnActions
}

export function ColumnLane({
  project,
  column,
  columns,
  isFirst,
  isLast,
  drop,
  ticketActions,
  columnActions,
}: ColumnLaneProps) {
  const here = drop !== null && drop.column === column.id ? drop : null
  return (
    <section
      data-column={column.id}
      aria-label={column.name}
      className={cn(
        'flex w-64 shrink-0 flex-col gap-2 rounded-xl p-2',
        column.colour === null
          ? 'bg-muted/50'
          : // the 3px edge comes out of the top padding, so headers line up across lanes
            [swatchSurface({ colour: column.colour }), 'border-t-3 pt-1.25'],
      )}
    >
      <header className="flex items-center gap-1.5 px-1">
        <ColourDot colour={column.colour} />
        <h2 className="min-w-0 truncate text-sm font-semibold text-strong">
          {column.name}
        </h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          {column.tickets.length}
        </span>
        <span className="ml-auto flex items-center">
          <Tip label={`New ticket in ${column.name}`}>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`New ticket in ${column.name}`}
              onClick={() => columnActions.addTicket(column)}
              className="text-muted-foreground"
            >
              <Plus />
            </Button>
          </Tip>
          <ColumnMenu
            column={column}
            isFirst={isFirst}
            isLast={isLast}
            actions={columnActions}
          />
        </span>
      </header>
      <ul className="relative flex min-h-16 flex-1 flex-col gap-2">
        {here !== null && here.beside === null && (
          <li
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-1 -top-[5px] h-0.5 rounded-full bg-primary"
          />
        )}
        {column.tickets.map((ticket) => (
          <TicketCard
            key={ticket.id}
            project={project}
            ticket={ticket}
            siblings={column.tickets}
            columns={columns}
            dropMark={
              here !== null && here.beside === ticket.id ? here.place : null
            }
            actions={ticketActions}
          />
        ))}
        {column.tickets.length === 0 && (
          <li className="px-1 py-2 text-xs text-muted-foreground">
            No tickets
          </li>
        )}
      </ul>
    </section>
  )
}
