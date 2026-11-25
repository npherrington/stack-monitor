// Firing a schedule: start what it names in its checkout, the way the page would, and log the fire.
// A run already going in the checkout means this fire starts nothing; the log says so.
import { runClaudeWorkflow } from '../agents/claude-workflows.ts'
import { startRun, type RunOptions } from '../agents/runs.ts'
import { runWorkflow } from '../agents/starts.ts'
import type { Tracking } from '../settings.ts'
import type { Fire, Schedule, StartRunResult } from '../types.ts'
import { appendFire, claimFire, readSchedules } from './store.ts'

export interface FireOptions extends RunOptions {
  schedules: string // the schedules directory
  now?: Date
}

function start(
  tracking: Tracking,
  schedule: Schedule,
  options: RunOptions,
): Promise<StartRunResult> {
  const { task, checkout } = schedule
  switch (task.kind) {
    case 'prompt':
      return startRun(
        tracking,
        {
          checkout,
          title: schedule.name,
          permissions: task.permissions,
          steps: [
            { agent: task.agent, model: task.model, prompt: task.prompt },
          ],
        },
        'task',
        options,
      )
    case 'workflow':
      return runWorkflow(tracking, { checkout, name: task.name }, options)
    case 'claude': {
      const { kind: _, ...rest } = task
      return runClaudeWorkflow(tracking, { checkout, ...rest }, options)
    }
  }
}

// null when there was nothing to fire: no such schedule, it's off, or this minute already fired.
export async function fireSchedule(
  tracking: Tracking,
  id: string,
  by: Fire['by'],
  { schedules: dir, now = new Date(), ...options }: FireOptions,
): Promise<Fire | null> {
  const list = readSchedules(dir)
  if ('problem' in list) return null
  const schedule = list.find((each) => each.id === id)
  if (schedule === undefined) return null
  if (by !== 'now') {
    if (!schedule.enabled) return null
    const minute = new Date(now)
    minute.setSeconds(0, 0)
    if (!claimFire(dir, id, minute)) return null
  }
  let started: StartRunResult
  try {
    started = await start(tracking, schedule, options)
  } catch (error) {
    started = {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
      log: null,
      runId: null,
    }
  }
  const fire: Fire = {
    id,
    at: now.toISOString(),
    by,
    ok: started.ok,
    runId: started.runId,
    message: started.message,
  }
  appendFire(dir, fire)
  return fire
}
