// Listing, saving and deleting schedules, keeping each launchd one's LaunchAgent in step, and the
// running monitor's minute ticker for the ones that fire from it.
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type * as z from 'zod'

import { listClaudeWorkflows } from '../agents/claude-workflows.ts'
import { repoOfCheckout, type RunOptions } from '../agents/runs.ts'
import { readWorkflow } from '../agents/workflows.ts'
import { writeJsonFile, type Tracking } from '../settings.ts'
import {
  failure,
  type ActionResult,
  type Schedule,
  type SaveScheduleResult,
  type ScheduleView,
  type StartRunResult,
} from '../types.ts'
import { calendarIntervals, matches, nextFires, parseCron } from './cron.ts'
import { fireSchedule } from './fire.ts'
import { systemLaunchd, type FireCommand, type Launchd } from './launchd.ts'
import {
  logsDir,
  readFires,
  readSchedules,
  writeSchedules,
  type SaveScheduleSchema,
} from './store.ts'

export const FIRE_CLI = join(import.meta.dirname, 'fire-cli.ts')
const FIRES_SHOWN = 10
const KEPT_ENV = [
  'PATH',
  'HOME',
  'STACK_MONITOR_SETTINGS',
  'STACK_MONITOR_RUNS',
  'STACK_MONITOR_SCHEDULES',
]

export interface ScheduleContext {
  dir: string // the schedules directory
  launchd: Launchd
  runs?: RunOptions
}

// The monitor's own fire command: this node running fire-cli.ts, with the environment launchd
// won't pass on.
export function nodeFireCommand(
  env: NodeJS.ProcessEnv = process.env,
): FireCommand {
  const kept: Record<string, string> = {}
  for (const key of KEPT_ENV) {
    const value = env[key]
    if (value !== undefined && value !== '') kept[key] = value
  }
  return { program: process.execPath, args: [FIRE_CLI], env: kept }
}

export function scheduleContext(dir: string): ScheduleContext {
  return {
    dir,
    launchd: systemLaunchd({ fire: nodeFireCommand(), logs: logsDir(dir) }),
  }
}

function blockedFile(dir: string): string {
  return join(dir, 'blocked.json')
}

// Schedules whose probe found a path launchd can't read, by id.
function readBlocked(dir: string): Record<string, string> {
  try {
    return JSON.parse(readFileSync(blockedFile(dir), 'utf8')) as Record<
      string,
      string
    >
  } catch {
    return {}
  }
}

function setBlocked(dir: string, id: string, path: string | null): void {
  const blocked = readBlocked(dir)
  if (path === null) delete blocked[id]
  else blocked[id] = path
  writeJsonFile(blockedFile(dir), blocked)
}

export function fullDiskAccess(program: string, path: string): string {
  return `macOS won't let launchd read ${path}. Give ${program} Full Disk Access in System Settings → Privacy & Security → Full Disk Access, or fire this schedule from the monitor instead.`
}

function launchdBlocked(launchd: Launchd, id: string): boolean {
  try {
    return /Operation not permitted|EPERM/.test(
      readFileSync(launchd.errLog(id), 'utf8'),
    )
  } catch {
    return false
  }
}

export async function listSchedules(
  tracking: Tracking,
  { dir, launchd }: ScheduleContext,
  now: Date = new Date(),
): Promise<ScheduleView[] | { problem: string }> {
  const list = readSchedules(dir)
  if ('problem' in list) return list
  const fires = readFires(dir)
  const blocked = readBlocked(dir)
  const views: ScheduleView[] = []
  for (const schedule of list) {
    const repo = await repoOfCheckout(tracking, schedule.checkout)
    const cron = parseCron(schedule.cron)
    let problem: string | null = null
    if ('problem' in cron) problem = cron.problem
    else if ('refused' in repo) problem = repo.refused
    else if (schedule.enabled && schedule.fireFrom === 'launchd') {
      if (blocked[schedule.id] !== undefined) {
        problem = fullDiskAccess(launchd.program, blocked[schedule.id])
      } else if (launchdBlocked(launchd, schedule.id)) {
        problem = fullDiskAccess(launchd.program, schedule.checkout)
      } else if (!(await launchd.loaded(schedule.id))) {
        problem =
          "launchd doesn't have this schedule loaded. Save it again to put it back."
      }
    }
    views.push({
      ...schedule,
      root: 'refused' in repo ? null : repo.root,
      next:
        'problem' in cron || !schedule.enabled
          ? []
          : nextFires(cron, now, 3).map((at) => at.toISOString()),
      fires: fires
        .filter((fire) => fire.id === schedule.id)
        .slice(0, FIRES_SHOWN),
      problem,
    })
  }
  return views
}

function saved(
  message: string,
  id: string | null,
  ok = true,
  blocked: SaveScheduleResult['blocked'] = null,
): SaveScheduleResult {
  return { ok, message, log: null, id, blocked }
}

// The task names something the checkout's repo has.
async function taskProblem(
  schedule: z.output<typeof SaveScheduleSchema>,
  root: string,
  checkout: string,
): Promise<string | null> {
  const { task } = schedule
  if (task.kind === 'workflow' && readWorkflow(root, task.name) === null) {
    return `${root} has no workflow ${task.name}`
  }
  if (
    task.kind === 'claude' &&
    !listClaudeWorkflows(checkout).claude.some(
      (each) => each.name === task.name,
    )
  ) {
    return `${checkout} has no Claude Code workflow ${task.name}`
  }
  return null
}

export async function saveSchedule(
  tracking: Tracking,
  request: z.output<typeof SaveScheduleSchema>,
  { dir, launchd }: ScheduleContext,
): Promise<SaveScheduleResult> {
  const cron = parseCron(request.cron)
  if ('problem' in cron) return saved(cron.problem, null, false)
  const intervals = calendarIntervals(cron)
  if (request.fireFrom === 'launchd' && intervals.length > 500) {
    return saved(
      `That cron line is ${intervals.length} launchd times; launchd takes up to 500. Simplify it, or fire it from the monitor.`,
      null,
      false,
    )
  }
  const repo = await repoOfCheckout(tracking, request.checkout)
  if ('refused' in repo) return saved(repo.refused, null, false)
  const wrong = await taskProblem(request, repo.root, repo.checkout)
  if (wrong !== null) return saved(wrong, null, false)
  const list = readSchedules(dir)
  if ('problem' in list) return saved(list.problem, null, false)
  const id = request.id ?? randomBytes(4).toString('hex')
  if (request.id !== undefined && !list.some((each) => each.id === id)) {
    return saved(`There's no schedule ${id}`, null, false)
  }
  const schedule: Schedule = { ...request, id, checkout: repo.checkout }
  writeSchedules(dir, [...list.filter((each) => each.id !== id), schedule])
  const verb = request.id === undefined ? 'Added' : 'Saved'
  if (!schedule.enabled || schedule.fireFrom === 'monitor') {
    await launchd.remove(id)
    setBlocked(dir, id, null)
    return saved(
      schedule.enabled
        ? `${verb} ${schedule.name}. It fires while the monitor is running.`
        : `${verb} ${schedule.name}, switched off.`,
      id,
    )
  }
  const blockedPath = await launchd.probe([...launchd.reads, repo.checkout])
  setBlocked(dir, id, blockedPath)
  const notInstalled = await launchd.install(id, intervals)
  if (notInstalled !== null) {
    return saved(`${verb} ${schedule.name}, but ${notInstalled}`, id, false)
  }
  if (blockedPath !== null) {
    return saved(
      `${verb} ${schedule.name}, but it won't fire yet. ${fullDiskAccess(launchd.program, blockedPath)}`,
      id,
      true,
      { program: launchd.program, path: blockedPath },
    )
  }
  return saved(
    `${verb} ${schedule.name}. launchd fires it, the monitor running or not.`,
    id,
  )
}

export async function deleteSchedule(
  id: string,
  { dir, launchd }: ScheduleContext,
): Promise<ActionResult> {
  const list = readSchedules(dir)
  if ('problem' in list) return failure(list.problem)
  const schedule = list.find((each) => each.id === id)
  if (schedule === undefined) return failure(`There's no schedule ${id}`)
  await launchd.remove(id)
  setBlocked(dir, id, null)
  writeSchedules(
    dir,
    list.filter((each) => each.id !== id),
  )
  return { ok: true, message: `Deleted ${schedule.name}`, log: null }
}

export async function runScheduleNow(
  tracking: Tracking,
  id: string,
  { dir, runs }: ScheduleContext,
): Promise<StartRunResult> {
  const fire = await fireSchedule(tracking, id, 'now', {
    schedules: dir,
    ...runs,
  })
  if (fire === null) {
    return { ...failure(`There's no schedule ${id}`), runId: null }
  }
  return { ok: fire.ok, message: fire.message, log: null, runId: fire.runId }
}

// Fires the schedules set to fire from the monitor, checking at the top of each minute. Returns the
// way to stop it.
export function startScheduleTicker(
  tracking: Tracking,
  context: ScheduleContext,
): () => void {
  let timer: NodeJS.Timeout | undefined
  const tick = async () => {
    const now = new Date()
    const list = readSchedules(context.dir)
    if (!('problem' in list)) {
      for (const schedule of list) {
        if (!schedule.enabled || schedule.fireFrom !== 'monitor') continue
        const cron = parseCron(schedule.cron)
        if ('problem' in cron || !matches(cron, now)) continue
        await fireSchedule(tracking, schedule.id, 'monitor', {
          schedules: context.dir,
          now,
          ...context.runs,
        }).catch((error: unknown) => console.error(error))
      }
    }
    schedule()
  }
  const schedule = () => {
    const now = Date.now()
    timer = setTimeout(() => void tick(), 60_000 - (now % 60_000) + 500)
    timer.unref()
  }
  schedule()
  return () => clearTimeout(timer)
}
