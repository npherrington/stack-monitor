import { CalendarDays, MessageSquare } from 'lucide-react'
import { Link } from 'react-router'

import type { BoardColumn, TicketSummary } from '../../../core/types.ts'
import type { TicketActions } from '@/components/board/board-actions.ts'
import { BoardLabelPill } from '@/components/board/board-label-pill.tsx'
import { PriorityIcon } from '@/components/board/priority-icon.tsx'
import { TicketCardMenu } from '@/components/board/ticket-card-menu.tsx'
import { Pill } from '@/components/ui/pill.tsx'
import { formatDay } from '@/lib/board-dates.ts'
import { boardPath } from '@/lib/board-links.ts'

interface TicketCardProps {
  project: number
  ticket: TicketSummary
  siblings: TicketSummary[] // the cards showing in its column, itself among them
  columns: BoardColumn[]
  dropMark: 'before' | 'after' | null // where a dragged card would land beside this one
  actions: TicketActions
}

// One ticket on the board. The whole card drags; its title opens it.
export function TicketCard({
  project,
  ticket,
  siblings,
  columns,
  dropMark,
  actions,
}: TicketCardProps) {
  const hasFooter =
    ticket.labels.length > 0 || ticket.dueOn !== null || ticket.commentCount > 0
  return (
    <li
      data-ticket={ticket.id}
      draggable
      className="relative flex cursor-grab flex-col gap-1.5 rounded-lg bg-card p-2.5 ring-1 ring-foreground/10 active:cursor-grabbing"
    >
      {dropMark !== null && (
        <span
          aria-hidden="true"
          className={
            dropMark === 'before'
              ? 'pointer-events-none absolute inset-x-1 -top-[5px] h-0.5 rounded-full bg-primary'
              : 'pointer-events-none absolute inset-x-1 -bottom-[5px] h-0.5 rounded-full bg-primary'
          }
        />
      )}
      <div className="flex items-center gap-1.5">
        <PriorityIcon priority={ticket.priority} />
        <span className="font-mono text-[11px] text-muted-foreground">
          {ticket.key}
        </span>
        <span className="ml-auto">
          <TicketCardMenu
            ticket={ticket}
            siblings={siblings}
            columns={columns}
            actions={actions}
          />
        </span>
      </div>
      <Link
        to={boardPath(project, ticket.number)}
        draggable={false}
        className="rounded-sm text-sm font-medium break-words text-strong outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
      >
        {ticket.title}
      </Link>
      {hasFooter && (
        <div className="flex flex-wrap items-center gap-1.5">
          {ticket.labels.map((label) => (
            <BoardLabelPill key={label.id} label={label} />
          ))}
          {ticket.dueOn !== null && (
            <Pill tone={ticket.overdue ? 'attention' : 'neutral'}>
              <CalendarDays aria-hidden="true" />
              {ticket.overdue && 'Overdue: '}
              {formatDay(ticket.dueOn)}
            </Pill>
          )}
          {ticket.commentCount > 0 && (
            <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
              <MessageSquare aria-hidden="true" className="size-3.5" />
              {ticket.commentCount}
              <span className="sr-only">
                {ticket.commentCount === 1 ? 'comment' : 'comments'}
              </span>
            </span>
          )}
        </div>
      )}
    </li>
  )
}
