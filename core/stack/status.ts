// How each of a stack's services reads in one checkout, from the machine read once per request.
// The port, compose and process checks are pure over that read; only a command check runs
// anything, and only from the personal config.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  INDEX,
  type Config,
  type ServiceConfig,
  type StackConfig,
} from '../config/schema.ts'
import { run } from '../run.ts'
import type { ServiceState } from '../types.ts'
import type { Machine, MachineNeeds } from './machine.ts'

const COMMAND_TIMEOUT_MS = 5_000
export const UNTRUSTED_COMMAND =
  'command checks run only from your own config (Settings → Stack)'

type Status = ServiceConfig['status']
type Reading = Omit<ServiceState, 'name'>

// A checkout, as the checks see it.
export interface Place {
  path: string // canonical
  roots: string[] // every checkout's path, so a nested one owns what's inside it
  // Its worktree index. null: the config keeps none. A string: why it couldn't be read.
  index: number | string | null
  readEnv: (file: string) => Map<string, string> | null // an env file of its, null when missing
}

// `path` is `root` or somewhere under it. Both canonical.
export function isInside(path: string, root: string): boolean {
  return (
    path === root || path.startsWith(root.endsWith('/') ? root : `${root}/`)
  )
}

// The deepest root holding `path`: a worktree nested in another owns what's inside it.
export function owningCheckout(path: string, roots: string[]): string | null {
  let best: string | null = null
  for (const root of roots) {
    if (isInside(path, root) && (best === null || root.length > best.length)) {
      best = root
    }
  }
  return best
}

// A dotenv file: KEY=value lines, `export ` allowed, quotes taken off, a ` #` comment after an
// unquoted value dropped. The last of a key wins.
export function parseEnv(text: string): Map<string, string> {
  const values = new Map<string, string>()
  for (const line of text.split('\n')) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(
      line,
    )
    if (!match) continue
    let value = match[2].trim()
    const quote = value[0]
    if ((quote === '"' || quote === "'") && value.indexOf(quote, 1) > 0) {
      value = value.slice(1, value.indexOf(quote, 1))
    } else {
      value = value.replace(/\s+#.*$/, '')
    }
    values.set(match[1], value)
  }
  return values
}

export function envReader(checkout: string): Place['readEnv'] {
  return (file) => {
    try {
      return parseEnv(readFileSync(join(checkout, file), 'utf8'))
    } catch {
      return null
    }
  }
}

function asInt(value: string | undefined): number | null {
  return value !== undefined && /^\d+$/.test(value.trim())
    ? Number(value)
    : null
}

// The checkout's worktree index, from worktrees.index's file and key.
export function readIndex(
  config: Config,
  readEnv: Place['readEnv'],
): Place['index'] {
  const kept = config.worktrees.index
  if (kept === undefined) return null
  const index = asInt(readEnv(kept.file)?.get(kept.key))
  return index ?? `no ${kept.key} in ${kept.file}`
}

const reading = (state: Reading['state'], detail: string | null): Reading => ({
  state,
  detail,
})

// The checkout's port: its env file's key, else base plus its index (just base without one).
export function portNumber(
  port: NonNullable<Status['port']>,
  place: Place,
): number | { unknown: string } {
  if (port.file !== undefined && port.key !== undefined) {
    const value = asInt(place.readEnv(port.file)?.get(port.key))
    if (value !== null && value >= 1 && value <= 65535) return value
    if (port.base === undefined) {
      return { unknown: `no port in ${port.file}'s ${port.key}` }
    }
  }
  if (port.base === undefined) return { unknown: 'no port configured' }
  if (typeof place.index === 'string') return { unknown: place.index }
  return port.base + (place.index ?? 0)
}

function owner(machine: Machine, pid: number, place: Place): string | null {
  const cwd = machine.cwds.get(pid)
  return cwd === undefined ? null : owningCheckout(cwd, place.roots)
}

export function portState(
  port: NonNullable<Status['port']>,
  machine: Machine,
  place: Place,
): Reading {
  if (machine.unreadable !== null) return reading('unknown', machine.unreadable)
  const number = portNumber(port, place)
  if (typeof number !== 'number') return reading('unknown', number.unknown)
  const holders = machine.listeners.get(number) ?? []
  if (holders.length === 0) return reading('down', `nothing on port ${number}`)
  return holders.some((pid) => owner(machine, pid, place) === place.path)
    ? reading('up', `port ${number}`)
    : reading('down', `port ${number} held by another checkout or program`)
}

export function composeState(
  compose: NonNullable<Status['compose']>,
  machine: Machine,
  place: Place,
): Reading {
  if (!machine.containers.ok) {
    return reading('unknown', machine.containers.message)
  }
  let project = compose.project
  if (project?.includes(INDEX)) {
    if (typeof place.index !== 'number') {
      return reading('unknown', place.index ?? 'no worktree index')
    }
    project = project.replaceAll(INDEX, String(place.index))
  }
  const mine = machine.containers.list.filter(
    (container) =>
      owningCheckout(container.workingDir, place.roots) === place.path &&
      (project === undefined || container.project === project),
  )
  const up = compose.parts.filter((part) =>
    mine.some((container) => container.service === part && container.running),
  ).length
  const of = compose.parts.length
  const state = up === of ? 'up' : up === 0 ? 'down' : 'partial'
  return reading(state, `${up} of ${of} containers`)
}

// A path of the checkout's spelled in the command line: ps joins arguments with spaces, so a path
// with a space in it can't be split off, and each root is looked for as text instead.
function spells(command: string, root: string): boolean {
  for (let at = command.indexOf(root); at !== -1;) {
    const before = at === 0 ? ' ' : command[at - 1]
    const after = command[at + root.length] ?? ' '
    if (/[\s='"]/.test(before) && /[\s/'"]/.test(after)) return true
    at = command.indexOf(root, at + 1)
  }
  return false
}

export function argumentOwner(command: string, roots: string[]): string | null {
  let best: string | null = null
  for (const root of roots) {
    if (spells(command, root) && (best === null || root.length > best.length)) {
      best = root
    }
  }
  return best
}

export function processState(
  { match, owner: by = 'cwd' }: NonNullable<Status['process']>,
  machine: Machine,
  place: Place,
): Reading {
  if (machine.unreadable !== null) return reading('unknown', machine.unreadable)
  const pids = machine.processes
    .filter(
      ({ pid, command }) =>
        command.includes(match) &&
        (by === 'cwd'
          ? owner(machine, pid, place)
          : argumentOwner(command, place.roots)) === place.path,
    )
    .map(({ pid }) => pid)
  if (pids.length === 0) return reading('down', `no process matching ${match}`)
  return reading(
    'up',
    `${pids.length === 1 ? 'pid' : 'pids'} ${pids.join(', ')}`,
  )
}

// trusted: the config in effect is the personal file. A committed file's commands aren't run on a
// page read.
export async function commandState(
  command: string,
  place: Place,
  trusted: boolean,
): Promise<Reading> {
  if (!trusted) return reading('unknown', UNTRUSTED_COMMAND)
  let script = command
  if (script.includes(INDEX)) {
    if (typeof place.index !== 'number') {
      return reading('unknown', place.index ?? 'no worktree index')
    }
    script = script.replaceAll(INDEX, String(place.index))
  }
  const { code, stderr } = await run('/bin/sh', ['-c', script], {
    cwd: place.path,
    timeoutMs: COMMAND_TIMEOUT_MS,
  })
  if (code === 0) return reading('up', null)
  return code === -1
    ? reading('down', `the check didn't finish: ${stderr.trim()}`)
    : reading('down', `the check exited ${code}`)
}

function serviceState(
  status: Status,
  machine: Machine,
  place: Place,
  trusted: boolean,
): Reading | Promise<Reading> {
  if (status.port) return portState(status.port, machine, place)
  if (status.compose) return composeState(status.compose, machine, place)
  if (status.process) return processState(status.process, machine, place)
  if (status.command) return commandState(status.command, place, trusted)
  return reading('unknown', 'no status check')
}

// In declared order.
export async function readServiceStates(
  stack: StackConfig,
  machine: Machine,
  place: Place,
  trusted: boolean,
): Promise<ServiceState[]> {
  return Promise.all(
    Object.entries(stack.services).map(async ([name, service]) => ({
      name,
      ...(await serviceState(service.status, machine, place, trusted)),
    })),
  )
}

export function goneStates(stack: StackConfig): ServiceState[] {
  return Object.keys(stack.services).map((name) => ({
    name,
    state: 'unknown',
    detail: 'its directory is gone',
  }))
}

// What the machine read has to cover for these stacks.
export function machineNeeds(stacks: StackConfig[]): MachineNeeds {
  const statuses = stacks.flatMap((stack) =>
    Object.values(stack.services).map((service) => service.status),
  )
  return {
    ports: statuses.some((status) => status.port !== undefined),
    matches: statuses.flatMap((status) =>
      status.process === undefined ? [] : [status.process.match],
    ),
    compose: statuses.some((status) => status.compose !== undefined),
  }
}
