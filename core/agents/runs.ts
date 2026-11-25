// Headless agent runs: started into a run directory under a detached launcher, and read back from
// that directory on every request. Nothing about a run is kept in memory.
import { spawn } from 'node:child_process'
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

import { z } from 'zod'

import { loadRepoConfig, PathText } from '../repos.ts'
import { run } from '../run.ts'
import { readRepoList, writeJsonFile, type Tracking } from '../settings.ts'
import {
  errorMessage,
  failure,
  type ActionResult,
  type RunDetail,
  type RunEvent,
  type RunKind,
  type RunState,
  type RunSummary,
  type StartRunRequest,
  type StartRunResult,
} from '../types.ts'
import { canonical, listWorktrees } from '../worktrees/clone.ts'
import { ADAPTERS } from './adapters/index.ts'
import { findProgram } from './detect.ts'
import {
  EXIT_FILE,
  LAUNCHER_ERR,
  META_FILE,
  newRunId,
  PID_FILE,
  readExit,
  readMeta,
  readPid,
  RUN_ID,
  runsDir,
  stepErr,
  stepOut,
  type Meta,
} from './run-files.ts'
import { AgentIdSchema, ModelName, readAgentSettings } from './settings.ts'

export const MAX_STEPS = 4
// Four of them fit the server's 64 KB body cap.
const MAX_PROMPT = 12_000
const MAX_TITLE = 120
export const LIST_LIMIT = 50
const EVENTS_KEPT = 2000
const STDERR_BYTES = 8 * 1024
// A run with meta.json and no pid yet is starting; past this, the start never finished.
const START_GRACE_MS = 30_000
const LAUNCHER = join(import.meta.dirname, 'launcher.ts')

export const RunIdText = z.string().regex(RUN_ID, 'must be a run id')
const Title = z.string().trim().min(1).max(MAX_TITLE)
export const Prompt = z.string().trim().min(1).max(MAX_PROMPT)
export const PermissionsSchema = z.enum(['read', 'edit', 'full'])

export const RunStepSchema = z.strictObject({
  agent: AgentIdSchema,
  model: ModelName.nullable(),
  prompt: Prompt,
  title: Title.optional(),
})

export const StartRunSchema = z.strictObject({
  checkout: PathText,
  title: Title.optional(),
  permissions: PermissionsSchema,
  steps: z.array(RunStepSchema).min(1).max(MAX_STEPS),
}) satisfies z.ZodType<StartRunRequest>

export const RunIdRequest = z.object({ id: RunIdText })
export const RunsRequest = z.object({ root: PathText.optional() })

function refused(message: string): StartRunResult {
  return { ...failure(message), runId: null }
}

// The tracked repo a checkout is a worktree of, by its primary checkout.
export async function repoOfCheckout(
  tracking: Tracking,
  checkout: string,
): Promise<{ root: string; checkout: string } | { refused: string }> {
  const list = readRepoList(tracking.settings, tracking.seed)
  if ('problem' in list) return { refused: list.problem }
  const wanted = canonical(checkout)
  for (const repo of list.repos) {
    let worktrees
    try {
      worktrees = await listWorktrees(repo.root)
    } catch {
      continue
    }
    if (worktrees.some((each) => canonical(each.path) === wanted)) {
      return { root: repo.root, checkout: wanted }
    }
  }
  return { refused: `${checkout} isn't a worktree of a tracked repo` }
}

// The first line of the first prompt, when the run isn't given a title.
function titleOf(request: StartRunRequest): string {
  const [first] = request.steps
  const line = (first.title ?? first.prompt).trim().split('\n', 1)[0]
  return line.length > 60 ? `${line.slice(0, 59)}…` : line
}

// Checkouts with a start under way in this process, so two clicks can't both pass the check that
// nothing is running there.
const starting = new Set<string>()

export interface RunOptions {
  dir?: string // where run directories go
  env?: NodeJS.ProcessEnv // PATH, for finding the CLIs
}

export async function startRun(
  tracking: Tracking,
  request: StartRunRequest,
  kind: RunKind,
  { dir = runsDir(), env = process.env }: RunOptions = {},
): Promise<StartRunResult> {
  if (request.steps.length < 1 || request.steps.length > MAX_STEPS) {
    return refused(`A run has 1 to ${MAX_STEPS} steps`)
  }
  const repo = await repoOfCheckout(tracking, request.checkout)
  if ('refused' in repo) return refused(repo.refused)
  const { root, checkout } = repo
  const config = loadRepoConfig(tracking, root)
  if (!config.ok) return refused(`${config.problem}. Fix it to start a run.`)
  const settings = readAgentSettings(tracking.settings)
  if ('problem' in settings) return refused(settings.problem)
  const repoEnv = config.config.agents?.env ?? {}
  const steps: Meta['steps'] = []
  for (const step of request.steps) {
    const adapter = ADAPTERS[step.agent]
    const program = await findProgram(adapter, settings, env)
    if (program === null) {
      return refused(
        `${adapter.label} isn't installed on this machine. Install it with ${adapter.install}`,
      )
    }
    const model = step.model ?? settings.agents?.[step.agent]?.model ?? null
    const command = adapter.command({ ...step, model }, request.permissions)
    steps.push({
      agent: step.agent,
      model,
      title: step.title ?? null,
      prompt: step.prompt,
      command: {
        program,
        argv: command.argv,
        env: { ...command.env, ...repoEnv },
      },
    })
  }
  if (starting.has(checkout)) {
    return refused(`A run is already starting in ${checkout}`)
  }
  starting.add(checkout)
  try {
    const going = (await listRuns(dir, root)).find(
      (each) => each.checkout === checkout && each.state === 'running',
    )
    if (going !== undefined) {
      return refused(
        `"${going.title}" is still running in ${checkout}. Stop it or wait for it to end.`,
      )
    }
    const meta: Meta = {
      id: newRunId(),
      kind,
      title: request.title ?? titleOf(request),
      root,
      checkout,
      permissions: request.permissions,
      startedAt: new Date().toISOString(),
      steps,
    }
    return launch(join(dir, meta.id), meta)
  } finally {
    starting.delete(checkout)
  }
}

function launch(runDir: string, meta: Meta): StartRunResult {
  try {
    mkdirSync(runDir, { recursive: true })
    writeJsonFile(join(runDir, META_FILE), meta)
    const err = openSync(join(runDir, LAUNCHER_ERR), 'a')
    try {
      // detached: its own session, so it outlives the monitor and a Ctrl-C in its terminal.
      const child = spawn(process.execPath, [LAUNCHER, runDir], {
        cwd: meta.checkout,
        detached: true,
        stdio: ['ignore', 'ignore', err],
      })
      child.unref()
      if (child.pid === undefined) throw new Error("the launcher didn't start")
      writeFileSync(join(runDir, PID_FILE), `${child.pid}\n`)
    } finally {
      closeSync(err)
    }
  } catch (error) {
    rmSync(runDir, { recursive: true, force: true })
    return refused(`Couldn't start the run: ${errorMessage(error)}`)
  }
  return {
    ok: true,
    message: `Started "${meta.title}" in ${meta.checkout}`,
    log: null,
    runId: meta.id,
  }
}

// The launchers among pids that are still alive: by ps, which also names the run directory, so a
// pid the system has since given to something else doesn't read as the run.
async function liveLaunchers(pids: Map<number, string>): Promise<Set<number>> {
  if (pids.size === 0) return new Set()
  const { stdout } = await run('ps', [
    '-ww',
    '-o',
    'pid=,command=',
    '-p',
    [...pids.keys()].join(','),
  ])
  const alive = new Set<number>()
  for (const line of stdout.split('\n')) {
    const match = /^\s*(\d+)\s+(.*)$/.exec(line)
    if (match === null) continue
    const pid = Number(match[1])
    const runDir = pids.get(pid)
    if (runDir !== undefined && match[2].includes(runDir)) alive.add(pid)
  }
  return alive
}

function readTail(path: string, bytes: number): string {
  try {
    const whole = readFileSync(path)
    return whole.subarray(Math.max(0, whole.length - bytes)).toString('utf8')
  } catch {
    return ''
  }
}

function lines(path: string): string[] {
  try {
    return readFileSync(path, 'utf8').split('\n')
  } catch {
    return []
  }
}

function modified(path: string): string | null {
  try {
    return statSync(path).mtime.toISOString()
  } catch {
    return null
  }
}

// The run as its directory has it now. alive: its launcher is running or still starting, which
// settles a run with no exit file.
function readFrom(runDir: string, meta: Meta, alive: boolean): RunDetail {
  const exit = readExit(runDir)
  const events: RunEvent[] = []
  let ran = 0 // the last step with a stdout file
  let report: string | null = null
  let sessionId: string | null = null
  let cost: number | null = null
  for (const [at, step] of meta.steps.entries()) {
    const out = stepOut(runDir, at)
    if (!existsSync(out)) continue
    ran = at
    report = null
    sessionId = null
    events.push({ kind: 'step', step: at, state: 'started' })
    const parse = ADAPTERS[step.agent].parser(at)
    for (const line of lines(out)) {
      const parsed = parse(line)
      sessionId = parsed.sessionId ?? sessionId
      for (const event of parsed.events) {
        events.push(event)
        if (event.kind === 'report') report = event.text
        if (event.kind === 'cost') cost = (cost ?? 0) + event.usd
      }
    }
    const ended = exit?.steps[at]
    if (ended !== undefined) {
      events.push({
        kind: 'step',
        step: at,
        state: ended.code === 0 ? 'finished' : 'failed',
      })
    } else if (
      at < meta.steps.length - 1 &&
      existsSync(stepOut(runDir, at + 1))
    ) {
      events.push({ kind: 'step', step: at, state: 'finished' })
    }
  }
  let state: RunState
  let endedAt: string | null = null
  if (exit !== null) {
    state = exit.state
    endedAt = exit.endedAt
  } else if (alive) {
    state = 'running'
  } else {
    state = 'failed'
    endedAt = modified(stepOut(runDir, ran)) ?? modified(join(runDir, PID_FILE))
    events.push({
      kind: 'error',
      step: ran,
      text: 'the launcher stopped without recording an exit',
    })
  }
  const last = meta.steps[ran]
  const stderr = [
    readTail(join(runDir, LAUNCHER_ERR), STDERR_BYTES),
    readTail(stepErr(runDir, ran), STDERR_BYTES),
  ]
    .filter(Boolean)
    .join('\n')
  return {
    run: {
      id: meta.id,
      kind: meta.kind,
      title: meta.title,
      root: meta.root,
      checkout: meta.checkout,
      permissions: meta.permissions,
      steps: meta.steps.map(({ agent, model, title }) => ({
        agent,
        model,
        title,
      })),
      step: ran,
      state,
      startedAt: meta.startedAt,
      endedAt,
      cost,
      report,
      resume:
        sessionId === null ? null : ADAPTERS[last.agent].resume(sessionId),
    },
    events: events.slice(-EVENTS_KEPT),
    stderr: stderr.slice(-STDERR_BYTES),
  }
}

// Whether each run with no exit file is still going: its launcher alive, or its pid not yet written
// by a start that's under way.
async function liveness(
  dir: string,
  metas: Meta[],
): Promise<Map<string, boolean>> {
  const pids = new Map<number, string>()
  const result = new Map<string, boolean>()
  for (const meta of metas) {
    const runDir = join(dir, meta.id)
    if (existsSync(join(runDir, EXIT_FILE))) {
      result.set(meta.id, false)
      continue
    }
    const pid = readPid(runDir)
    if (pid === null) {
      const age = Date.now() - Date.parse(meta.startedAt)
      result.set(meta.id, age < START_GRACE_MS)
      continue
    }
    pids.set(pid, runDir)
  }
  const alive = await liveLaunchers(pids)
  for (const [pid, runDir] of pids) {
    const meta = metas.find((each) => join(dir, each.id) === runDir)
    if (meta !== undefined) result.set(meta.id, alive.has(pid))
  }
  return result
}

// null when there's no such run. The id is checked against RUN_ID before it touches a path.
export async function readRun(
  id: string,
  dir: string = runsDir(),
): Promise<RunDetail | null> {
  if (!RUN_ID.test(id)) return null
  const runDir = join(dir, id)
  const meta = readMeta(runDir)
  if (meta === null || meta.id !== id) return null
  const live = await liveness(dir, [meta])
  return readFrom(runDir, meta, live.get(id) ?? false)
}

// Newest first, at most LIST_LIMIT; only the repo's when root is given.
export async function listRuns(
  dir: string = runsDir(),
  root?: string,
): Promise<RunSummary[]> {
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
  const metas: Meta[] = []
  const ids = names.filter((each) => RUN_ID.test(each)).toSorted()
  for (const name of ids.toReversed()) {
    const meta = readMeta(join(dir, name))
    if (meta === null || meta.id !== name) continue
    if (root !== undefined && meta.root !== root) continue
    metas.push(meta)
    if (metas.length === LIST_LIMIT) break
  }
  const live = await liveness(dir, metas)
  return metas.map(
    (meta) =>
      readFrom(join(dir, meta.id), meta, live.get(meta.id) ?? false).run,
  )
}

// SIGTERM to the launcher, which passes it to the step running and records the run as stopped.
export async function stopRun(
  id: string,
  dir: string = runsDir(),
): Promise<ActionResult> {
  const detail = await readRun(id, dir)
  if (detail === null) return failure(`There's no run ${id}`)
  if (detail.run.state !== 'running') {
    return failure(`"${detail.run.title}" has already ended`)
  }
  const pid = readPid(join(dir, id))
  if (pid === null) return failure(`"${detail.run.title}" is still starting`)
  try {
    process.kill(pid, 'SIGTERM')
  } catch (error) {
    return failure(
      `Couldn't stop "${detail.run.title}": ${errorMessage(error)}`,
    )
  }
  return {
    ok: true,
    message: `Asked "${detail.run.title}" to stop`,
    log: null,
  }
}
