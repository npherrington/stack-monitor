import { CircleCheck, CircleStop, CircleX, LoaderCircle } from 'lucide-react'

import type { RunState as State } from '../../../core/types.ts'
import { Pill } from '@/components/ui/pill.tsx'
import { cn } from '@/lib/utils.ts'

const TONES = {
  running: 'highlight',
  done: 'good',
  failed: 'problem',
  stopped: 'neutral',
} as const

export function RunStatePill({ state }: { state: State }) {
  return <Pill tone={TONES[state]}>{state}</Pill>
}

const ICONS = {
  running: { icon: LoaderCircle, tone: 'animate-spin text-strong' },
  done: { icon: CircleCheck, tone: 'text-success' },
  failed: { icon: CircleX, tone: 'text-destructive' },
  stopped: { icon: CircleStop, tone: 'text-muted-foreground' },
} as const

// The state as an icon, for a row with no room for the word; the caller says it in words nearby.
export function RunStateIcon({
  state,
  className,
}: {
  state: State
  className?: string
}) {
  const { icon: Icon, tone } = ICONS[state]
  return (
    <Icon
      aria-hidden="true"
      className={cn('size-3.5 shrink-0', tone, className)}
    />
  )
}
