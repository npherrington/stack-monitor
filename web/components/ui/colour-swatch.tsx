import type { VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'

import { swatchFill } from '@/components/ui/swatch-variants.ts'
import { cn } from '@/lib/utils.ts'

interface ColourSwatchProps
  extends
    Omit<ComponentProps<'button'>, 'type'>,
    VariantProps<typeof swatchFill> {
  selected: boolean
  label: string
}

// A round colour choice; the ring says which one is chosen.
export function ColourSwatch({
  colour,
  selected,
  label,
  className,
  ...props
}: ColourSwatchProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      title={label}
      className={cn(
        swatchFill({ colour }),
        'size-6 rounded-full border border-strong/10 transition outline-none hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring aria-pressed:ring-2 aria-pressed:ring-strong/60 aria-pressed:ring-offset-2 aria-pressed:ring-offset-popover',
        className,
      )}
      {...props}
    />
  )
}
