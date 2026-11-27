import {
  CircleAlert,
  Minus,
  SignalHigh,
  SignalLow,
  SignalMedium,
  type LucideIcon,
} from 'lucide-react'

import type { Priority } from '../../../core/types.ts'
import { PRIORITY_LABELS } from '@/components/board/priority.ts'
import { Tip } from '@/components/ui/tooltip.tsx'
import { cn } from '@/lib/utils.ts'

const ICONS: Record<Priority, LucideIcon> = {
  urgent: CircleAlert,
  high: SignalHigh,
  medium: SignalMedium,
  low: SignalLow,
  none: Minus,
}

interface PriorityIconProps {
  priority: Priority
}

// A ticket's priority as an icon, with the word on hover and for a screen reader.
export function PriorityIcon({ priority }: PriorityIconProps) {
  const Icon = ICONS[priority]
  return (
    <Tip label={PRIORITY_LABELS[priority]}>
      <span
        className={cn(
          'inline-flex shrink-0 text-muted-foreground',
          priority === 'urgent' && 'text-warning',
        )}
      >
        <Icon aria-hidden="true" className="size-3.5" />
        <span className="sr-only">{PRIORITY_LABELS[priority]}</span>
      </span>
    </Tip>
  )
}
