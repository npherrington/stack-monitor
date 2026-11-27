// Making a worktree for a tracked repo: its own worktrees.create command when it has one, else git
// worktree add beside the primary, cut from the mainline, then setup and a background install.
import { spawn } from 'node:child_process'
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'

import { z } from 'zod'

import { BRANCH, INDEX, type Config } from '../config/schema.ts'
import { trackedRepo } from '../config/sections.ts'
import { BranchName } from '../fields.ts'
import { loadRepoConfig, PathText } from '../repos.ts'
import { run, type RunResult } from '../run.ts'
import { envReader, readIndex } from '../stack/status.ts'
import type { Tracking } from '../settings.ts'
import { errorMessage, failure, type ActionResult } from '../types.ts'
import { listWorktrees } from './clone.ts'

const COMMAND_TIMEOUT_MS = 10 * 60_000
export const INSTALLS_ENV = 'STACK_MONITOR_INSTALLS'

export { BranchName }

export const CreateWorktreeRequest = z.strictObject({
  root: PathText,
  branch: BranchName,
})

export function installsDir(
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
): string {
  const named = env[INSTALLS_ENV]
  if (named) return named
  return join(
    env.XDG_STATE_HOME || join(home, '.local', 'state'),
    'stack-monitor',
    'installs',
  )
}

// The last few lines a failed command printed, for the message.
export function tail(result: RunResult): string {
  const text = (result.stderr.trim() || result.stdout.trim()).split('\n')
  return text.slice(-6).join('\n')
}

export function shell(command: string, cwd: string): Promise<RunResult> {
  return run('sh', ['-c', command], { cwd, timeoutMs: COMMAND_TIMEOUT_MS })
}

// feature/login beside /code/app is /code/app-feature-login.
export function worktreePath(root: string, branch: string): string {
  return join(dirname(root), `${basename(root)}-${branch.replaceAll('/', '-')}`)
}

// The lowest index from 1 to max that no other worktree holds.
export async function freeIndex(
  root: string,
  config: Config,
): Promise<number | string> {
  const kept = config.worktrees.index
  if (kept === undefined) return 0
  const taken = new Set<number>()
  for (const worktree of await listWorktrees(root)) {
    const index = readIndex(config, envReader(worktree.path))
    if (typeof index === 'number') taken.add(index)
  }
  for (let index = 1; index <= kept.max; index++) {
    if (!taken.has(index)) return index
  }
  return `every index up to ${kept.max} is taken`
}

// Sets KEY=index in the worktree's env file, keeping its other lines.
function writeIndex(path: string, file: string, key: string, index: number) {
  const at = join(path, file)
  const line = `${key}=${index}`
  const lines = existsSync(at) ? readFileSync(at, 'utf8').split('\n') : []
  const pattern = new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=`) // oxlint-disable-line prefer-regex-literals
  const found = lines.findIndex((text) => pattern.test(text))
  if (found === -1) {
    if (lines.at(-1) === '') lines.pop()
    lines.push(line, '')
  } else lines[found] = line
  mkdirSync(dirname(at), { recursive: true })
  writeFileSync(at, lines.join('\n'))
}

// Detached with its output in a log, so a long install neither holds the request open nor dies
// with the monitor.
function startInstall(command: string, cwd: string, name: string): string {
  const dir = installsDir()
  mkdirSync(dir, { recursive: true })
  const log = join(dir, `${name}-${Date.now()}.log`)
  const out = openSync(log, 'a')
  try {
    spawn('sh', ['-c', command], {
      cwd,
      detached: true,
      stdio: ['ignore', out, out],
    }).unref()
  } finally {
    closeSync(out)
  }
  return log
}

// Takes back a worktree whose setup failed: the directory git made and the branch it cut, when
// it cut one.
async function takeBack(root: string, path: string, branch: string | null) {
  await run('git', ['-C', root, 'worktree', 'remove', '--force', path])
  if (branch !== null) await run('git', ['-C', root, 'branch', '-D', branch])
}

// What follows git worktree add: the index written, setup run, install started in the background.
// A step that fails takes the worktree back. {branch} is '' for a detached worktree. steps: a
// review of a fork's PR runs neither command, since they would run its code.
export async function finishWorktree(
  root: string,
  path: string,
  branch: string | null,
  config: Config,
  index: number,
  steps: { setup: boolean; install: boolean },
): Promise<{ log: string | null } | { refused: string }> {
  const { setup, install, index: kept } = config.worktrees
  try {
    if (kept !== undefined) writeIndex(path, kept.file, kept.key, index)
  } catch (error) {
    await takeBack(root, path, branch)
    return { refused: `Couldn't write ${kept?.file}: ${errorMessage(error)}` }
  }
  const fill = (command: string) =>
    command.replaceAll(INDEX, String(index)).replaceAll(BRANCH, branch ?? '')
  if (steps.setup && setup !== undefined) {
    const ran = await shell(fill(setup), path)
    if (ran.code !== 0) {
      await takeBack(root, path, branch)
      return {
        refused: `Setup failed, so the worktree was taken back: ${tail(ran)}`,
      }
    }
  }
  if (!steps.install || install === undefined) return { log: null }
  return { log: startInstall(fill(install), path, basename(path)) }
}

async function addWithGit(
  root: string,
  branch: string,
  config: Config,
): Promise<ActionResult> {
  const path = worktreePath(root, branch)
  if (existsSync(path)) return failure(`${path} already exists`)
  const index = await freeIndex(root, config)
  if (typeof index === 'string') return failure(index)
  const added = await run('git', [
    '-C',
    root,
    'worktree',
    'add',
    '-q',
    '-b',
    branch,
    path,
    config.mainline,
  ])
  if (added.code !== 0) {
    return failure(`git worktree add failed: ${tail(added)}`)
  }
  const finished = await finishWorktree(root, path, branch, config, index, {
    setup: true,
    install: true,
  })
  if ('refused' in finished) return failure(finished.refused)
  const made = `Made ${path} on ${branch}, from ${config.mainline}`
  return finished.log === null
    ? { ok: true, message: made, log: null }
    : {
        ok: true,
        message: `${made}. Installing in the background`,
        log: finished.log,
      }
}

const making = new Set<string>()

export function alreadyMaking(root: string): string {
  return `A worktree is already being made for ${root}`
}

// One make at a time per repo, so two can't race into one index or path. busy: what to answer
// when one is already under way.
export async function makingIn<Made>(
  root: string,
  busy: Made,
  make: () => Promise<Made>,
): Promise<Made> {
  if (making.has(root)) return busy
  making.add(root)
  try {
    return await make()
  } finally {
    making.delete(root)
  }
}

export async function createWorktree(
  tracking: Tracking,
  { root: given, branch }: z.output<typeof CreateWorktreeRequest>,
): Promise<ActionResult> {
  const repo = trackedRepo(tracking, given)
  if ('problem' in repo) return failure(repo.problem)
  if ('refused' in repo) return failure(repo.refused)
  const { root } = repo
  const loaded = loadRepoConfig(tracking, root)
  if (!loaded.ok) return failure(loaded.problem)
  const checked = await run('git', ['check-ref-format', '--branch', branch])
  if (checked.code !== 0)
    return failure(`${branch} isn't a branch name git takes`)
  const exists = await run('git', [
    '-C',
    root,
    'rev-parse',
    '--verify',
    '--quiet',
    `refs/heads/${branch}`,
  ])
  if (exists.code === 0) return failure(`${branch} is already a branch`)
  return makingIn(root, failure(alreadyMaking(root)), async () => {
    const { config } = loaded
    const create = config.worktrees.create
    if (create === undefined) return addWithGit(root, branch, config)
    const command = create.replaceAll(BRANCH, branch)
    const ran = await shell(command, root)
    return ran.code === 0
      ? { ok: true, message: `Ran ${command}`, log: null }
      : failure(`${command} failed: ${tail(ran)}`)
  })
}
