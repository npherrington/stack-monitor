import type { PullLabel } from '../../../core/types.ts'
import { Pill } from '@/components/ui/pill.tsx'

interface LabelPillProps {
  label: PullLabel
}

// A PR label in the colour its repo gave it: a tint and a border, with the text left in the
// theme's colour so it reads in light and dark. The colour is checked as six hex digits on the
// server before it reaches this style.
export function LabelPill({ label }: LabelPillProps) {
  const style =
    label.color === null
      ? undefined
      : {
          backgroundColor: `#${label.color}2e`,
          boxShadow: `inset 0 0 0 1px #${label.color}`,
        }
  return <Pill style={style}>{label.name}</Pill>
}
