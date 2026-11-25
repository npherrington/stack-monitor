// A run's directory, the only record of it: meta.json written before the launcher starts, a
// step-<n>.jsonl and step-<n>.err per step it reached, the launcher's pid, and exit once it ends.
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { z } from 'zod'

import { AGENT_IDS } from '../config/schema.ts'

export const RUNS_ENV = 'STACK_MONITOR_RUNS'

export function runsDir(
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
): string {
  const named = env[RUNS_ENV]
  if (named) return named
  return join(
    env.XDG_STATE_HOME || join(home, '.local', 'state'),
    'stack-monitor',
    'runs',
  )
}

// 20261125T101500123-a1b2c3d4: the start time in UTC, so names sort by it, and 4 random bytes.
export const RUN_ID = /^\d{8}T\d{9}-[0-9a-f]{8}$/

export function newRunId(now: Date = new Date()): string {
  const stamp = now.toISOString().replace(/[-:.Z]/g, '')
  return `${stamp}-${randomBytes(4).toString('hex')}`
}

export const META_FILE = 'meta.json'
export const PID_FILE = 'pid'
export const EXIT_FILE = 'exit'
export const LAUNCHER_ERR = 'launcher.err'

export function stepOut(dir: string, step: number): string {
  return join(dir, `step-${step}.jsonl`)
}

export function stepErr(dir: string, step: number): string {
  return join(dir, `step-${step}.err`)
}

const CommandSchema = z.object({
  program: z.string(),
  argv: z.array(z.string()),
  env: z.record(z.string(), z.string()),
})

const MetaStepSchema = z.object({
  agent: z.enum(AGENT_IDS),
  model: z.string().nullable(),
  title: z.string().nullable(),
  prompt: z.string(),
  command: CommandSchema,
  // A repo's launcher script, whose own lines come before the agent's stream.
  launcher: z.boolean().optional(),
})

export const MetaSchema = z.object({
  id: z.string(),
  kind: z.enum(['task', 'workflow', 'skill', 'draft']),
  title: z.string(),
  root: z.string(),
  checkout: z.string(),
  permissions: z.enum(['read', 'edit', 'full']),
  startedAt: z.string(),
  steps: z.array(MetaStepSchema).min(1),
})
export type Meta = z.output<typeof MetaSchema>

const StepExitSchema = z.object({
  code: z.number().nullable(), // null when a signal ended it
  signal: z.string().nullable(),
})
export type StepExit = z.output<typeof StepExitSchema>

export const ExitSchema = z.object({
  state: z.enum(['done', 'failed', 'stopped']),
  endedAt: z.string(),
  steps: z.array(StepExitSchema), // the steps that ran, in order
})
export type Exit = z.output<typeof ExitSchema>

// null when it's missing or not what this version writes.
function readJson<T>(path: string, schema: z.ZodType<T>): T | null {
  try {
    const parsed = schema.safeParse(JSON.parse(readFileSync(path, 'utf8')))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function readMeta(dir: string): Meta | null {
  return readJson(join(dir, META_FILE), MetaSchema)
}

export function readExit(dir: string): Exit | null {
  return readJson(join(dir, EXIT_FILE), ExitSchema)
}

export function readPid(dir: string): number | null {
  try {
    const pid = Number(readFileSync(join(dir, PID_FILE), 'utf8').trim())
    return Number.isInteger(pid) && pid > 0 ? pid : null
  } catch {
    return null
  }
}
