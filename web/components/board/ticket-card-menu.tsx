import {
  Archive,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Bot,
  Ellipsis,
  Flag,
  Trash2,
} from 'lucide-react'

import {
  PRIORITIES,
  type BoardColumn,
  type Priority,
  type TicketSummary,
} from '../../../core/types.ts'
import type { TicketActions } from '@/components/board/board-actions.ts'
import { PRIORITY_LABELS } from '@/components/board/priority.ts'
import { Button } from '@/components/ui/button.tsx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.tsx'
import { stepFor } from '@/lib/board-order.ts'

interface TicketCardMenuProps {
  ticket: TicketSummary
  siblings: TicketSummary[] // the cards showing in its column, top first, itself among them
  columns: BoardColumn[]
  actions: TicketActions
}

// Everything a drag does, for the keyboard, and the rest a card can have done to it.
export function TicketCardMenu({
  ticket,
  siblings,
  columns,
  actions,
}: TicketCardMenuProps) {
  const up = stepFor(siblings, ticket.id, -1)
  const down = stepFor(siblings, ticket.id, 1)
  const others = columns.filter((column) => column.id !== ticket.column)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Actions for ${ticket.key}`}
            className="text-muted-foreground"
          />
        }
      >
        <Ellipsis aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44 p-1">
        <DropdownMenuItem onClick={() => actions.work(ticket)}>
          <Bot />
          Work this ticket…
        </DropdownMenuItem>
        <DropdownMenuSeparator className="my-1" />
        {others.length > 0 && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <ArrowRight />
              Move to
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-44 p-1">
              {others.map((column) => (
                <DropdownMenuItem
                  key={column.id}
                  onClick={() =>
                    actions.move(ticket.id, {
                      column: column.id,
                      beside: null,
                      place: 'before',
                    })
                  }
                >
                  {column.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        <DropdownMenuItem
          disabled={up === null}
          onClick={() => up !== null && actions.move(ticket.id, up)}
        >
          <ArrowUp />
          Move up
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={down === null}
          onClick={() => down !== null && actions.move(ticket.id, down)}
        >
          <ArrowDown />
          Move down
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Flag />
            Priority
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-40 p-1">
            <DropdownMenuRadioGroup
              value={ticket.priority}
              onValueChange={(value: Priority) =>
                actions.setPriority(ticket.id, value)
              }
            >
              {PRIORITIES.map((priority) => (
                <DropdownMenuRadioItem
                  key={priority}
                  value={priority}
                  closeOnClick
                >
                  {PRIORITY_LABELS[priority]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator className="my-1" />
        <DropdownMenuItem onClick={() => actions.archive(ticket)}>
          <Archive />
          Archive
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          onClick={() => actions.remove(ticket)}
        >
          <Trash2 />
          Delete…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
