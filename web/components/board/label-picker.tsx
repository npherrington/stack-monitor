import { Tags } from 'lucide-react'

import type { BoardLabel } from '../../../core/types.ts'
import { ColourDot } from '@/components/board/colour-dot.tsx'
import { Button } from '@/components/ui/button.tsx'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.tsx'

interface LabelPickerProps {
  id?: string
  labels: BoardLabel[] // the ones this project can use, shared first
  value: number[]
  onChange: (labels: number[]) => void
}

// The labels on a ticket, ticked in a menu that stays open while several are chosen.
export function LabelPicker({ id, labels, value, onChange }: LabelPickerProps) {
  const picked = labels.filter((label) => value.includes(label.id))
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            id={id}
            variant="outline"
            className="h-auto min-h-8 w-full justify-start py-1 whitespace-normal"
          />
        }
      >
        <Tags aria-hidden="true" className="text-muted-foreground" />
        {picked.length === 0 ? (
          <span className="text-muted-foreground">No labels</span>
        ) : (
          <span className="flex flex-wrap gap-x-2 gap-y-1 text-left">
            {picked.map((label) => (
              <span key={label.id} className="inline-flex items-center gap-1">
                <ColourDot colour={label.colour} />
                {label.name}
              </span>
            ))}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56 p-1">
        {labels.length === 0 ? (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">
            No labels yet. Add some from the project's menu, under Labels.
          </p>
        ) : (
          labels.map((label) => (
            <DropdownMenuCheckboxItem
              key={label.id}
              checked={value.includes(label.id)}
              onCheckedChange={(checked) =>
                onChange(
                  checked
                    ? [...value, label.id]
                    : value.filter((each) => each !== label.id),
                )
              }
            >
              <ColourDot colour={label.colour} />
              <span className="min-w-0 flex-1 truncate">{label.name}</span>
              {label.project === null && (
                <span className="text-[10px] text-muted-foreground">
                  shared
                </span>
              )}
            </DropdownMenuCheckboxItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
