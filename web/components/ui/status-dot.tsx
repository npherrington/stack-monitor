import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils.ts'

const statusDotVariants = cva('size-2 shrink-0 rounded-full', {
  variants: {
    state: {
      on: 'bg-success',
      off: 'bg-muted-foreground/50',
      up: 'bg-success shadow-[0_0_0_3px] shadow-success/20',
      partial: 'bg-warning',
      down: 'bg-muted-foreground/40',
      unknown: 'border border-dashed border-muted-foreground bg-transparent',
    },
  },
})

interface StatusDotProps
  extends ComponentProps<'span'>, VariantProps<typeof statusDotVariants> {}

// Decoration beside a label that already says the state in words.
export function StatusDot({ state, className, ...props }: StatusDotProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(statusDotVariants({ state }), className)}
      {...props}
    />
  )
}
