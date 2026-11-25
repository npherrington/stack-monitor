import { Copy, Square, Wrench } from 'lucide-react'

import type { RunEvent } from '../../../core/types.ts'
import { RunStatePill } from '@/components/agents/run-state.tsx'
import { Button } from '@/components/ui/button.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.tsx'
import { Pill } from '@/components/ui/pill.tsx'
import { Skeleton } from '@/components/ui/skeleton.tsx'
import { toast } from '@/components/ui/toast-manager.ts'
import { useRunDetail } from '@/hooks/use-run-detail.ts'
import { useStopRun } from '@/hooks/use-runs.ts'

interface RunLogDialogProps {
  runId: string | null
  onClose: () => void
  // Offered under the report when given: a draft's "Use this", say.
  onUseReport?: (report: string) => void
}

// A run's log as it goes, and its report once done. Everything an agent wrote renders as text.
export function RunLogDialog({
  runId,
  onClose,
  onUseReport,
}: RunLogDialogProps) {
  const { detail, isPending, error } = useRunDetail(runId)
  const stop = useStopRun()
  const run = detail?.run

  return (
    <Dialog open={runId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85dvh] grid-cols-[minmax(0,1fr)] overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {run?.title ?? 'Run'}
            {run !== undefined && <RunStatePill state={run.state} />}
          </DialogTitle>
          {run !== undefined && (
            <DialogDescription className="flex flex-wrap items-center gap-1.5">
              {run.steps.map((step, at) => (
                <Pill key={at} tone={at === run.step ? 'highlight' : 'neutral'}>
                  {run.steps.length > 1 ? `${at + 1}. ` : ''}
                  {step.title ?? step.agent}
                  {step.model !== null ? ` · ${step.model}` : ''}
                </Pill>
              ))}
              <Pill>{run.permissions}</Pill>
              {run.cost !== null && <Pill>${run.cost.toFixed(3)}</Pill>}
              <span className="font-mono text-xs break-all">
                {run.checkout}
              </span>
            </DialogDescription>
          )}
        </DialogHeader>
        {isPending ? (
          <Skeleton className="h-64" />
        ) : error !== null || detail === null ? (
          <p className="text-destructive" role="alert">
            {error?.message ?? 'No such run.'}
          </p>
        ) : (
          <div className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-1">
            {detail.run.report !== null && (
              <section className="rounded-2xl bg-accent/60 p-4">
                <h3 className="mb-2 text-sm font-bold text-strong">Report</h3>
                <p className="text-sm break-words whitespace-pre-wrap text-strong">
                  {detail.run.report}
                </p>
                {onUseReport !== undefined && detail.run.state === 'done' && (
                  <Button
                    size="sm"
                    className="mt-3"
                    onClick={() => onUseReport(detail.run.report ?? '')}
                  >
                    Use this
                  </Button>
                )}
              </section>
            )}
            <ol className="flex flex-col gap-1.5">
              {detail.events.map((event, at) => (
                <EventLine key={at} event={event} />
              ))}
              {detail.events.length === 0 && (
                <li className="text-sm text-muted-foreground">Nothing yet.</li>
              )}
            </ol>
            {detail.stderr.trim() !== '' && (
              <details className="text-xs">
                <summary className="cursor-pointer font-semibold text-muted-foreground">
                  stderr
                </summary>
                <pre className="mt-2 max-h-48 overflow-auto rounded-xl bg-secondary p-3 whitespace-pre-wrap">
                  {detail.stderr}
                </pre>
              </details>
            )}
          </div>
        )}
        {run !== undefined && (
          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
            {run.state === 'running' && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => stop(run.id)}
              >
                <Square />
                Stop
              </Button>
            )}
            {run.resume !== null && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const command = `cd ${run.checkout} && ${run.resume}`
                  navigator.clipboard.writeText(command).then(
                    () => toast.add({ title: 'Copied the resume command' }),
                    () => toast.add({ title: command }),
                  )
                }}
              >
                <Copy />
                Copy resume command
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function EventLine({ event }: { event: RunEvent }) {
  switch (event.kind) {
    case 'text':
      return (
        <li className="text-sm break-words whitespace-pre-wrap">
          {event.text}
        </li>
      )
    case 'tool':
      return (
        <li className="flex items-start gap-1.5 font-mono text-xs text-muted-foreground">
          <Wrench className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
          <span className="font-semibold">{event.name}</span>
          {event.detail !== null && (
            <span className="min-w-0 truncate">{event.detail}</span>
          )}
        </li>
      )
    case 'error':
      return (
        <li className="text-sm break-words whitespace-pre-wrap text-destructive">
          {event.text}
        </li>
      )
    case 'step':
      return (
        <li className="pt-2 text-xs font-bold text-muted-foreground">
          Step {event.step + 1} {event.state}
        </li>
      )
    case 'report':
    case 'cost':
      return null
  }
}
