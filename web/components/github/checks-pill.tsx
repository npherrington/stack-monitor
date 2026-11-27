import type { ChecksSummary } from '../../../core/types.ts'
import { Pill } from '@/components/ui/pill.tsx'

const SUMMARY: Record<
  Exclude<ChecksSummary, 'none'>,
  { label: string; tone: 'good' | 'problem' | 'attention' }
> = {
  passing: { label: 'Checks passing', tone: 'good' },
  failing: { label: 'Checks failing', tone: 'problem' },
  pending: { label: 'Checks running', tone: 'attention' },
}

interface ChecksPillProps {
  summary: ChecksSummary
}

// A PR's CI in one word; nothing when no check reported on its head commit.
export function ChecksPill({ summary }: ChecksPillProps) {
  if (summary === 'none') return null
  return <Pill tone={SUMMARY[summary].tone}>{SUMMARY[summary].label}</Pill>
}
