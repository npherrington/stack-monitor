import { Flag, Search, Tags } from 'lucide-react'

import {
  PRIORITIES,
  type BoardLabel,
  type Priority,
} from '../../../core/types.ts'
import { ColourDot } from '@/components/board/colour-dot.tsx'
import { PRIORITY_LABELS } from '@/components/board/priority.ts'
import { Button } from '@/components/ui/button.tsx'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.tsx'
import { Input } from '@/components/ui/input.tsx'
import type { BoardFilters } from '@/lib/board-filter.ts'
import type { NoArgCallback } from '@/lib/callbacks.ts'

interface BoardToolbarProps {
  filters: BoardFilters
  isFiltering: boolean
  labels: BoardLabel[] // the ones this project can use
  onSearch: (search: string) => void
  onToggleLabel: (id: number) => void
  onTogglePriority: (priority: Priority) => void
  onClear: NoArgCallback
}

interface CountProps {
  count: number
}

// How many of a filter's choices are on, beside its name.
function Count({ count }: CountProps) {
  if (count === 0) return null
  return (
    <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground tabular-nums">
      {count}
    </span>
  )
}

export function BoardToolbar({
  filters,
  isFiltering,
  labels,
  onSearch,
  onToggleLabel,
  onTogglePriority,
  onClear,
}: BoardToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-64">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          aria-label="Search tickets"
          placeholder="Search title or id"
          value={filters.search}
          onChange={(event) => onSearch(event.target.value)}
          className="pl-8"
        />
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" />}>
          <Tags aria-hidden="true" />
          <span className="sr-only">Filter by </span>
          Labels
          <Count count={filters.labels.length} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52 p-1">
          {labels.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              No labels yet.
            </p>
          ) : (
            labels.map((label) => (
              <DropdownMenuCheckboxItem
                key={label.id}
                checked={filters.labels.includes(label.id)}
                onCheckedChange={() => onToggleLabel(label.id)}
              >
                <ColourDot colour={label.colour} />
                <span className="min-w-0 flex-1 truncate">{label.name}</span>
              </DropdownMenuCheckboxItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" />}>
          <Flag aria-hidden="true" />
          <span className="sr-only">Filter by </span>
          Priority
          <Count count={filters.priorities.length} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44 p-1">
          {PRIORITIES.map((priority) => (
            <DropdownMenuCheckboxItem
              key={priority}
              checked={filters.priorities.includes(priority)}
              onCheckedChange={() => onTogglePriority(priority)}
            >
              {PRIORITY_LABELS[priority]}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {isFiltering && (
        <Button variant="ghost" onClick={() => onClear()}>
          Clear
        </Button>
      )}
    </div>
  )
}
