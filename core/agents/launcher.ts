// `node core/agents/launcher.ts <run-dir>`: the detached process a run lives under. It runs each
// step's command in the checkout, its stdout to step-<n>.jsonl and stderr to step-<n>.err, stops at
// the first step that fails, and writes exit last. SIGTERM is passed to the running step's process
// group and the run ends as stopped. Never SIGKILL: a CLI that ignores SIGTERM is left to finish.
import { spawn } from 'node:child_process'
import { appendFileSync, closeSync, existsSync, openSync } from 'node:fs'
import { join } from 'node:path'

import { writeJsonFile } from '../settings.ts'
import { errorMessage } from '../types.ts'
import {
  EXIT_FILE,
  LAUNCHER_ERR,
  readMeta,
  stepErr,
  stepOut,
  type Exit,
  type Meta,
  type StepExit,
} from './run-files.ts'

const CAFFEINATE = '/usr/bin/caffeinate'
// How long a stopped step gets to exit before the run is recorded as stopped regardless.
const STOP_WAIT_MS = 10_000

const dir = process.argv[2]
let running: number | null = null // the step's pid, which is also its process group
let stopping = false
const exits: StepExit[] = []

function finish(state: Exit['state']): never {
  const exit: Exit = { state, endedAt: new Date().toISOString(), steps: exits }
  writeJsonFile(join(dir, EXIT_FILE), exit)
  process.exit(0)
}

function stop(): void {
  if (stopping) return
  stopping = true
  if (running === null) finish('stopped')
  try {
    process.kill(-running, 'SIGTERM')
  } catch {
    // Already gone: its exit event is on the way.
  }
  setTimeout(() => finish('stopped'), STOP_WAIT_MS)
}

// Holds off idle sleep for as long as this process lives (-w), where a prefix would put
// caffeinate's pid where stopRun looks for the launcher's.
function holdOffSleep(): void {
  if (!existsSync(CAFFEINATE)) return
  spawn(CAFFEINATE, ['-i', '-w', String(process.pid)], {
    stdio: 'ignore',
  }).unref()
}

function runStep(meta: Meta, step: number): Promise<StepExit> {
  const { command } = meta.steps[step]
  const out = openSync(stepOut(dir, step), 'a')
  const err = openSync(stepErr(dir, step), 'a')
  return new Promise<StepExit>((settle) => {
    let child
    try {
      // detached: a group of its own, so a stop reaches whatever the CLI started.
      child = spawn(command.program, command.argv, {
        cwd: meta.checkout,
        // PWD too: OpenCode takes its project from it over the real cwd, and the inherited one
        // names wherever the monitor was started.
        env: { ...process.env, ...command.env, PWD: meta.checkout },
        stdio: ['ignore', out, err],
        detached: true,
      })
    } catch (error) {
      appendFileSync(err, `${errorMessage(error)}\n`)
      settle({ code: -1, signal: null })
      return
    }
    running = child.pid ?? null
    child.once('error', (error) => {
      appendFileSync(err, `${command.program}: ${errorMessage(error)}\n`)
      settle({ code: -1, signal: null })
    })
    child.once('exit', (code, signal) => settle({ code, signal }))
  }).finally(() => {
    running = null
    closeSync(out)
    closeSync(err)
  })
}

async function main(): Promise<void> {
  const meta = readMeta(dir)
  if (meta === null) {
    appendFileSync(join(dir, LAUNCHER_ERR), `No readable meta.json in ${dir}\n`)
    finish('failed')
  }
  process.on('SIGTERM', stop)
  holdOffSleep()
  for (let step = 0; step < meta.steps.length; step += 1) {
    if (stopping) break
    const exit = await runStep(meta, step)
    exits.push(exit)
    if (stopping) break
    if (exit.code !== 0) finish('failed')
  }
  finish(stopping ? 'stopped' : 'done')
}

main().catch((error: unknown) => {
  appendFileSync(join(dir, LAUNCHER_ERR), `${errorMessage(error)}\n`)
  finish('failed')
})
