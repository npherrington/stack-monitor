import { Palette } from 'lucide-react'

import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu.tsx'
import { swatchFill } from '@/components/ui/swatch-variants.ts'
import { SWATCHES, type Swatch } from '@/lib/swatches.ts'
import { cn } from '@/lib/utils.ts'

interface ColourMenuProps {
  colour: Swatch | undefined
  onPick: (colour: Swatch | undefined) => void
}

// A submenu of the swatches, plus none, for a row or a tab.
export function ColourMenu({ colour, onPick }: ColourMenuProps) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Palette />
        Colour
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-40">
        <DropdownMenuRadioGroup
          value={colour ?? 'none'}
          onValueChange={(value: Swatch | 'none') =>
            onPick(value === 'none' ? undefined : value)
          }
        >
          {(['none', ...SWATCHES] as const).map((swatch) => (
            <DropdownMenuRadioItem key={swatch} value={swatch}>
              <span
                aria-hidden="true"
                className={cn(
                  swatchFill({ colour: swatch }),
                  'size-3 rounded-full',
                  swatch === 'none' && 'border border-dashed border-border',
                )}
              />
              <span className={swatch === 'none' ? undefined : 'capitalize'}>
                {swatch === 'none' ? 'No colour' : swatch}
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
