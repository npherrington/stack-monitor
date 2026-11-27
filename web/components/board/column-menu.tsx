import { ArrowLeft, ArrowRight, Ellipsis, Pencil, Trash2 } from 'lucide-react'

import type { BoardColumn } from '../../../core/types.ts'
import type { ColumnActions } from '@/components/board/board-actions.ts'
import { Button } from '@/components/ui/button.tsx'
import { ColourMenu } from '@/components/ui/colour-menu.tsx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.tsx'

interface ColumnMenuProps {
  column: BoardColumn
  isFirst: boolean
  isLast: boolean
  actions: ColumnActions
}

export function ColumnMenu({
  column,
  isFirst,
  isLast,
  actions,
}: ColumnMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Actions for ${column.name}`}
            className="text-muted-foreground"
          />
        }
      >
        <Ellipsis aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44 p-1">
        <DropdownMenuItem onClick={() => actions.edit(column)}>
          <Pencil />
          Rename…
        </DropdownMenuItem>
        <ColourMenu
          colour={column.colour ?? undefined}
          onPick={(colour) => actions.recolour(column, colour ?? null)}
        />
        <DropdownMenuItem
          disabled={isFirst}
          onClick={() => actions.shift(column, -1)}
        >
          <ArrowLeft />
          Move left
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={isLast}
          onClick={() => actions.shift(column, 1)}
        >
          <ArrowRight />
          Move right
        </DropdownMenuItem>
        <DropdownMenuSeparator className="my-1" />
        <DropdownMenuItem
          variant="destructive"
          disabled={isFirst && isLast}
          onClick={() => actions.remove(column)}
        >
          <Trash2 />
          Delete…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
