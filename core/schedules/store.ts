// Where schedules live: ~/.local/state/stack-monitor/schedules/ ($STACK_MONITOR_SCHEDULES), holding
// schedules.json, the fire log fires.jsonl, the launchd jobs' output under logs/, and a lock per
// fire so launchd and a monitor, or two monitors, can't both fire the same minute.
import {
  appendFileSync,
  mkdirSync,
  openSync,
  closeSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import * as z from 'zod'

import { RunClaudeWorkflowSchema } from '../agents/claude-workflows.ts'
import { PermissionsSchema, Prompt } from '../agents/runs.ts'
import { AgentIdSchema, ModelName } from '../agents/settings.ts'
import { Name } from '../config/schema.ts'
import { PathText } from '../repos.ts'
import { writeJsonFile } from '../settings.ts'
import type { Fire, Schedule } from '../types.ts'

export const SCHEDULES_ENV = 'STACK_MONITOR_SCHEDULES'

export function schedulesDir(env: NodeJS.ProcessEnv = process.env): string {
  return (
    env[SCHEDULES_ENV] ||
    join(homedir(), '.local', 'state', 'stack-monitor', 'schedules')
  )
}

export const ScheduleId = z
  .string()
  .regex(/^[0-9a-f]{8}$/, 'must be a schedule id')

export const ScheduleTaskSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('prompt'),
    agent: AgentIdSchema,
    model: ModelName.nullable(),
    prompt: Prompt,
    permissions: PermissionsSchema,
  }),
  z.strictObject({ kind: z.literal('workflow'), name: Name }),
  RunClaudeWorkflowSchema.omit({ checkout: true }).extend({
    kind: z.literal('claude'),
  }),
])

const ScheduleFields = {
  name: z.string().trim().min(1, 'Name it').max(80),
  cron: z.string().trim().min(1).max(200),
  checkout: PathText,
  enabled: z.boolean(),
  fireFrom: z.enum(['launchd', 'monitor']),
  task: ScheduleTaskSchema,
}

export const ScheduleSchema = z.strictObject({
  id: ScheduleId,
  ...ScheduleFields,
}) satisfies z.ZodType<Schedule>

export const SaveScheduleSchema = z.strictObject({
  id: ScheduleId.optional(),
  ...ScheduleFields,
})

export const ScheduleIdRequest = z.strictObject({ id: ScheduleId })

const StoreSchema = z.object({ schedules: z.array(ScheduleSchema) })

const FireSchema = z.object({
  id: ScheduleId,
  at: z.string(),
  by: z.enum(['launchd', 'monitor', 'now']),
  ok: z.boolean(),
  runId: z.string().nullable(),
  message: z.string(),
}) satisfies z.ZodType<Fire>

const FIRES_KEPT = 2000

function storeFile(dir: string): string {
  return join(dir, 'schedules.json')
}

export function logsDir(dir: string): string {
  return join(dir, 'logs')
}

export function readSchedules(dir: string): Schedule[] | { problem: string } {
  let text: string
  try {
    text = readFileSync(storeFile(dir), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return { problem: `${storeFile(dir)} isn't JSON` }
  }
  const parsed = StoreSchema.safeParse(json)
  return parsed.success
    ? parsed.data.schedules
    : { problem: `${storeFile(dir)} doesn't read as schedules` }
}

export function writeSchedules(dir: string, schedules: Schedule[]): void {
  writeJsonFile(storeFile(dir), { schedules })
}

function firesFile(dir: string): string {
  return join(dir, 'fires.jsonl')
}

export function appendFire(dir: string, fire: Fire): void {
  mkdirSync(dir, { recursive: true })
  appendFileSync(firesFile(dir), `${JSON.stringify(fire)}\n`)
  const lines = readFileSync(firesFile(dir), 'utf8').split('\n')
  if (lines.length > FIRES_KEPT * 2) {
    writeJsonLines(dir, lines.slice(-FIRES_KEPT))
  }
}

function writeJsonLines(dir: string, lines: string[]): void {
  const keep = lines.filter((line) => line.trim() !== '')
  const temp = `${firesFile(dir)}.${process.pid}.tmp`
  writeFileSync(temp, `${keep.join('\n')}\n`)
  renameSync(temp, firesFile(dir))
}

// Newest first.
export function readFires(dir: string): Fire[] {
  let text: string
  try {
    text = readFileSync(firesFile(dir), 'utf8')
  } catch {
    return []
  }
  const fires: Fire[] = []
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue
    try {
      const parsed = FireSchema.safeParse(JSON.parse(line))
      if (parsed.success) fires.push(parsed.data)
    } catch {
      // A line cut short by a crash.
    }
  }
  return fires.toReversed()
}

const LOCK_DAYS = 2

// True for the first caller for this schedule and minute; false for every one after.
export function claimFire(dir: string, id: string, minute: Date): boolean {
  const locks = join(dir, 'locks')
  mkdirSync(locks, { recursive: true })
  const key = `${id}-${minute.toISOString().slice(0, 16).replace(':', '')}`
  try {
    closeSync(openSync(join(locks, key), 'wx'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false
    throw error
  }
  const old = Date.now() - LOCK_DAYS * 24 * 60 * 60 * 1000
  for (const name of readdirSync(locks)) {
    const path = join(locks, name)
    try {
      if (statSync(path).mtimeMs < old) rmSync(path, { force: true })
    } catch {
      // Another process took it first.
    }
  }
  return true
}
