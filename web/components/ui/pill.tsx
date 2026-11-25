import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils.ts'

const pillVariants = cva(
  'inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap [&_svg]:size-3.5',
  {
    variants: {
      tone: {
        neutral: 'bg-secondary text-secondary-foreground',
        good: 'bg-success/12 text-success',
        attention: 'bg-warning/12 text-warning',
        problem: 'bg-destructive/12 text-destructive',
        highlight: 'bg-accent text-accent-foreground',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
)

interface PillProps
  extends ComponentProps<'span'>, VariantProps<typeof pillVariants> {}

// A short fact beside a title: a count, a state, a tag.
export function Pill({ tone, className, ...props }: PillProps) {
  return <span className={cn(pillVariants({ tone }), className)} {...props} />
}
