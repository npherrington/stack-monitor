import type { BoardColour } from '../../../core/types.ts'
import { swatchFill } from '@/components/ui/swatch-variants.ts'
import { cn } from '@/lib/utils.ts'

interface ColourDotProps {
  colour: BoardColour | null
  className?: string
}

// The colour a project, a column or a label was given, beside its name; nothing when it has none.
export function ColourDot({ colour, className }: ColourDotProps) {
  if (colour === null) return null
  return (
    <span
      aria-hidden="true"
      className={cn(
        swatchFill({ colour }),
        'size-2.5 shrink-0 rounded-full',
        className,
      )}
    />
  )
}
