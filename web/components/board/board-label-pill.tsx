import type { TicketLabel } from '../../../core/types.ts'
import { ColourDot } from '@/components/board/colour-dot.tsx'
import { Pill } from '@/components/ui/pill.tsx'

interface BoardLabelPillProps {
  label: TicketLabel
}

export function BoardLabelPill({ label }: BoardLabelPillProps) {
  return (
    <Pill>
      <ColourDot colour={label.colour} />
      {label.name}
    </Pill>
  )
}
