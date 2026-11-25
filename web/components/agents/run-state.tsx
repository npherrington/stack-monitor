import type { RunState as State } from '../../../core/types.ts'
import { Pill } from '@/components/ui/pill.tsx'

const TONES = {
  running: 'highlight',
  done: 'good',
  failed: 'problem',
  stopped: 'neutral',
} as const

export function RunStatePill({ state }: { state: State }) {
  return <Pill tone={TONES[state]}>{state}</Pill>
}
