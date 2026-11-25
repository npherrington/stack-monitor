import { CalendarClock, Pencil, Play, Trash2 } from 'lucide-react'

import type { ScheduleView } from '../../../core/types.ts'
import { Button } from '@/components/ui/button.tsx'
import { Pill } from '@/components/ui/pill.tsx'
import { cn } from '@/lib/utils.ts'

function folder(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? path
}

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function taskLine(schedule: ScheduleView): string {
  const { task } = schedule
  if (task.kind === 'prompt') {
    const first = task.prompt.split('\n', 1)[0]
    return `Prompt: ${first.length > 90 ? `${first.slice(0, 89)}…` : first}`
  }
  if (task.kind === 'workflow') return `Workflow: ${task.name}`
  return `Claude Code workflow: ${task.name}${task.testRun === true ? ' (test run)' : ''}`
}

const BY: Record<string, string> = {
  launchd: 'launchd',
  monitor: 'monitor',
  now: 'Run now',
}

interface ScheduleCardProps {
  schedule: ScheduleView
  isRunning: boolean
  onRunNow: () => void
  onEdit: () => void
  onDelete: () => void
  onOpenRun: (id: string) => void
}

export function ScheduleCard({
  schedule,
  isRunning,
  onRunNow,
  onEdit,
  onDelete,
  onOpenRun,
}: ScheduleCardProps) {
  return (
    <li className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="font-bold text-strong">{schedule.name}</p>
          <p
            className="truncate text-sm text-muted-foreground"
            title={schedule.checkout}
          >
            {folder(schedule.checkout)}
          </p>
        </div>
        <Pill tone={schedule.enabled ? 'highlight' : undefined}>
          {schedule.enabled ? `fired by ${schedule.fireFrom}` : 'off'}
        </Pill>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <CalendarClock className="size-4 shrink-0 text-muted-foreground" />
        <code className="font-mono text-xs">{schedule.cron}</code>
        {schedule.next.length > 0 && (
          <span className="text-muted-foreground">
            next {when(schedule.next[0])}
          </span>
        )}
      </div>
      <p className="text-sm text-muted-foreground">{taskLine(schedule)}</p>
      {schedule.problem !== null && (
        <p
          role="alert"
          className="rounded-xl bg-destructive/10 p-2 text-sm text-destructive"
        >
          {schedule.problem}
        </p>
      )}
      {schedule.fires.length > 0 && (
        <ul className="flex flex-col gap-1 text-xs">
          {schedule.fires.slice(0, 3).map((fire) => (
            <li
              key={`${fire.at}-${fire.by}`}
              className="flex items-baseline gap-2"
            >
              <span
                className={cn(
                  'shrink-0',
                  fire.ok ? 'text-success' : 'text-destructive',
                )}
              >
                {fire.ok ? 'started' : 'skipped'}
              </span>
              <span className="shrink-0 whitespace-nowrap text-muted-foreground">
                {when(fire.at)} · {BY[fire.by]}
              </span>
              {fire.runId !== null ? (
                <button
                  type="button"
                  className="font-semibold text-strong underline-offset-2 hover:underline"
                  onClick={() => onOpenRun(fire.runId ?? '')}
                >
                  View log
                </button>
              ) : (
                <span
                  className="min-w-0 truncate text-muted-foreground"
                  title={fire.message}
                >
                  {fire.message}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-auto flex flex-wrap gap-2">
        <Button size="sm" onClick={onRunNow} disabled={isRunning}>
          <Play />
          Run now
        </Button>
        <Button size="sm" variant="ghost" onClick={onEdit}>
          <Pencil />
          Edit
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onDelete}
          className="text-destructive"
        >
          <Trash2 />
          Delete
        </Button>
      </div>
    </li>
  )
}
