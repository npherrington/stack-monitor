// What's running on this machine, read once per request and shared by every checkout of every
// repo: listening ports, processes and their working directories, and compose containers.
import { run } from '../run.ts'
import { canonical } from '../worktrees/clone.ts'

const READ_TIMEOUT_MS = 10_000
const DOCKER_TIMEOUT_MS = 5_000

export interface ProcessInfo {
  pid: number
  command: string
}

export interface Container {
  name: string
  running: boolean
  project: string
  service: string
  workingDir: string // where `docker compose` ran, symlinks resolved
}

export type Containers =
  { ok: true; list: Container[] } | { ok: false; message: string } // docker is missing or not running

export interface Machine {
  listeners: Map<number, number[]> // port → the pids listening on it
  processes: ProcessInfo[]
  cwds: Map<number, string> // of the listeners and the matching processes, symlinks resolved
  containers: Containers
  unreadable: string | null // why ports and processes couldn't be read: lsof or ps failed
}

// What the stacks in play need read. Anything not needed isn't run.
export interface MachineNeeds {
  ports: boolean
  matches: string[] // process matches; their cwds are read along with the listeners'
  compose: boolean
}

// `lsof -FpcnT`: a `p<pid>` line, then for each of its files an `f<fd>` line, an `n<address>` line
// and `T` lines. An address ends in its port: *:5173, 127.0.0.1:5173, [::1]:5173.
export function parseListeners(stdout: string): Map<number, number[]> {
  const listeners = new Map<number, number[]>()
  let pid = 0
  for (const line of stdout.split('\n')) {
    if (line.startsWith('p')) pid = Number(line.slice(1))
    if (!line.startsWith('n')) continue
    const port = Number(line.slice(line.lastIndexOf(':') + 1))
    if (!Number.isInteger(port) || port <= 0) continue
    const pids = listeners.get(port) ?? []
    if (!pids.includes(pid)) pids.push(pid)
    listeners.set(port, pids)
  }
  return listeners
}

// `lsof -a -d cwd -Fpn`: a `p<pid>` line, then the cwd's `n<path>`.
export function parseCwds(stdout: string): Map<number, string> {
  const cwds = new Map<number, string>()
  let pid = 0
  for (const line of stdout.split('\n')) {
    if (line.startsWith('p')) pid = Number(line.slice(1))
    else if (line.startsWith('n')) cwds.set(pid, line.slice(1))
  }
  return cwds
}

// `ps -o pid=,command=`: a line per process. ps prints a newline inside an argument as \012, so
// one line is always one process.
export function parsePs(stdout: string): ProcessInfo[] {
  return stdout.split('\n').flatMap((line) => {
    const match = /^\s*(\d+)\s+(.*)$/.exec(line)
    return match ? [{ pid: Number(match[1]), command: match[2] }] : []
  })
}

// docker's Labels: k=v pairs joined with commas. A comma inside a value (a path with one) leaves
// a piece without '=', which belongs to the value before it.
export function parseLabels(text: string): Map<string, string> {
  const labels = new Map<string, string>()
  let last: string | null = null
  for (const piece of text.split(',')) {
    const at = piece.indexOf('=')
    if (at === -1 && last !== null) {
      labels.set(last, `${labels.get(last)},${piece}`)
    } else if (at !== -1) {
      last = piece.slice(0, at)
      labels.set(last, piece.slice(at + 1))
    }
  }
  return labels
}

// `docker ps --format '{{json .}}'`: a JSON object per line. Only compose's containers are kept.
export function parseContainers(stdout: string): Container[] {
  return stdout.split('\n').flatMap((line) => {
    let row: Record<string, unknown>
    try {
      row = JSON.parse(line)
    } catch {
      return []
    }
    const labels = parseLabels(String(row.Labels ?? ''))
    const workingDir = labels.get('com.docker.compose.project.working_dir')
    if (workingDir === undefined) return []
    return [
      {
        name: String(row.Names ?? ''),
        running: row.State === 'running',
        project: labels.get('com.docker.compose.project') ?? '',
        service: labels.get('com.docker.compose.service') ?? '',
        workingDir,
      },
    ]
  })
}

// run() reads a program that's missing as code -1 with spawn's ENOENT.
function missing(stderr: string): boolean {
  return stderr.includes('ENOENT')
}

async function readContainers(): Promise<Containers> {
  const { code, stdout, stderr } = await run(
    'docker',
    ['ps', '--format', '{{json .}}'],
    { timeoutMs: DOCKER_TIMEOUT_MS },
  )
  if (code === 0) {
    const list = parseContainers(stdout).map((container) => ({
      ...container,
      workingDir: canonical(container.workingDir),
    }))
    return { ok: true, list }
  }
  if (missing(stderr)) return { ok: false, message: "docker isn't installed" }
  const [why = ''] = stderr.trim().split('\n')
  return { ok: false, message: `Docker isn't answering: ${why}`.trim() }
}

// lsof exits 1 when it matched nothing or a pid it was asked about has gone; what it found is
// still on stdout. Only a run that didn't happen at all is a failure.
async function lsof(args: string[]): Promise<string | { problem: string }> {
  const { code, stdout, stderr } = await run('lsof', args, {
    timeoutMs: READ_TIMEOUT_MS,
  })
  return code === -1 ? { problem: `lsof didn't answer: ${stderr}` } : stdout
}

async function readProcesses(): Promise<ProcessInfo[] | { problem: string }> {
  const { code, stdout, stderr } = await run(
    'ps',
    ['-axww', '-o', 'pid=,command='],
    { timeoutMs: READ_TIMEOUT_MS },
  )
  if (code !== 0) return { problem: `ps failed: ${stderr.trim()}` }
  // Not this monitor, whose own command line never names a service.
  return parsePs(stdout).filter(({ pid }) => pid !== process.pid)
}

const NOTHING: Machine = {
  listeners: new Map(),
  processes: [],
  cwds: new Map(),
  containers: { ok: true, list: [] },
  unreadable: null,
}

export async function readMachine(needs: MachineNeeds): Promise<Machine> {
  const [listed, processes, containers] = await Promise.all([
    needs.ports
      ? lsof(['-nP', '-iTCP', '-sTCP:LISTEN', '-FpcnT'])
      : Promise.resolve(''),
    needs.matches.length > 0 ? readProcesses() : Promise.resolve([]),
    needs.compose ? readContainers() : NOTHING.containers,
  ])
  const failed = [listed, processes].find(
    (read): read is { problem: string } =>
      typeof read === 'object' && 'problem' in read,
  )
  if (failed !== undefined) {
    return { ...NOTHING, containers, unreadable: failed.problem }
  }
  const listeners = parseListeners(listed as string)
  const matching = (processes as ProcessInfo[]).filter(({ command }) =>
    needs.matches.some((match) => command.includes(match)),
  )
  const pids = new Set([
    ...[...listeners.values()].flat(),
    ...matching.map(({ pid }) => pid),
  ])
  if (pids.size === 0) {
    return { ...NOTHING, listeners, processes: matching, containers }
  }
  const cwdText = await lsof([
    '-a',
    '-d',
    'cwd',
    '-p',
    [...pids].join(','),
    '-Fpn',
  ])
  if (typeof cwdText !== 'string') {
    return { ...NOTHING, containers, unreadable: cwdText.problem }
  }
  const cwds = new Map(
    [...parseCwds(cwdText)].map(([pid, cwd]) => [pid, canonical(cwd)]),
  )
  return {
    listeners,
    processes: matching,
    cwds,
    containers,
    unreadable: null,
  }
}
