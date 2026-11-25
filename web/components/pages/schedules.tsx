import { Plus } from 'lucide-react'
import { useState } from 'react'

import type { Schedule } from '../../../core/types.ts'
import { RunLogDialog } from '@/components/agents/run-log-dialog.tsx'
import { ScheduleCard } from '@/components/schedules/schedule-card.tsx'
import { ScheduleDialog } from '@/components/schedules/schedule-dialog.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Skeleton } from '@/components/ui/skeleton.tsx'
import { useAgents } from '@/hooks/use-agents.ts'
import { useCheckouts } from '@/hooks/use-checkouts.ts'
import { useSchedules } from '@/hooks/use-schedules.ts'

export function Schedules() {
  const {
    schedules,
    isPending,
    error,
    saveSchedule,
    deleteSchedule,
    runNow,
    isRunning,
  } = useSchedules()
  const { repos } = useCheckouts()
  const { overview } = useAgents()
  const [editing, setEditing] = useState<Schedule | 'new' | null>(null)
  const [openRun, setOpenRun] = useState<string | null>(null)

  const fire = async (id: string) => {
    try {
      setOpenRun(await runNow(id))
    } catch {
      // The toast says why.
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-extrabold text-strong">Schedules</h1>
          <p className="text-muted-foreground">
            A prompt or a workflow, started in one checkout on a cron timetable.
          </p>
        </div>
        <Button onClick={() => setEditing('new')} disabled={repos.length === 0}>
          <Plus />
          New schedule
        </Button>
      </header>
      {isPending ? (
        <Skeleton className="h-48" />
      ) : error !== null ? (
        <p role="alert" className="text-destructive">
          {error.message}
        </p>
      ) : schedules.length === 0 ? (
        <p className="text-muted-foreground">
          No schedules yet. A nightly dependency bump, a weekday-morning bug
          hunt: anything you can start from Run here can run on a timetable.
        </p>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {schedules.map((schedule) => (
            <ScheduleCard
              key={schedule.id}
              schedule={schedule}
              isRunning={isRunning}
              onRunNow={() => void fire(schedule.id)}
              onEdit={() => setEditing(schedule)}
              onDelete={() => deleteSchedule(schedule.id)}
              onOpenRun={setOpenRun}
            />
          ))}
        </ul>
      )}
      <ScheduleDialog
        open={editing !== null}
        editing={editing === 'new' ? null : editing}
        repos={repos}
        overview={overview}
        onSave={saveSchedule}
        onClose={() => setEditing(null)}
      />
      <RunLogDialog runId={openRun} onClose={() => setOpenRun(null)} />
    </div>
  )
}
