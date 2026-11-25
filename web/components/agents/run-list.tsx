import type { RunSummary } from '../../../core/types.ts'
import { RunStatePill } from '@/components/agents/run-state.tsx'

interface RunListProps {
  runs: RunSummary[]
  onOpen: (id: string) => void
  showCheckout?: boolean
}

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function RunList({ runs, onOpen, showCheckout = false }: RunListProps) {
  return (
    <ul className="flex flex-col divide-y rounded-xl border bg-card">
      {runs.map((run) => (
        <li key={run.id}>
          <button
            type="button"
            onClick={() => onOpen(run.id)}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-accent/40"
          >
            <RunStatePill state={run.state} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold text-strong">
                {run.title}
              </span>
              {showCheckout && (
                <span className="block truncate font-mono text-xs text-muted-foreground">
                  {run.checkout}
                </span>
              )}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {run.steps.map((step) => step.agent).join(' → ')} ·{' '}
              {when(run.startedAt)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
