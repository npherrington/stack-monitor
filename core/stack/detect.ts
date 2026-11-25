// Services a repo's own files suggest, for the stack editor to offer. Reads only: commands are
// suggested, never run, but for mise's and docker compose's listings of what they'd run.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'

import { Service, type ServiceInput } from '../config/schema.ts'
import { run as runProgram, type RunResult } from '../run.ts'
import type { DetectedService } from '../types.ts'

const LIST_TIMEOUT_MS = 5_000
const MAX_NAME = 24
const COMPOSE_FILES = [
  'compose.yaml',
  'compose.yml',
  'docker-compose.yml',
  'docker-compose.yaml',
]

// Passed in, so tests can stand in for mise and docker.
export type Runner = (
  program: string,
  args: string[],
  options: { cwd: string; timeoutMs: number },
) => Promise<RunResult>

// A DetectedService whose name settle() hasn't yet made a schema Name and unique.
type Suggestion = DetectedService

type Manager = 'npm' | 'pnpm' | 'yarn' | 'bun'

const LOCKFILES: [string, Manager][] = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lock', 'bun'],
  ['bun.lockb', 'bun'],
]

// Defaults of the dev servers a script names, when it doesn't pass a port. Checked in order, so a
// script running storybook alongside vite reads as storybook.
const TOOL_PORTS: [RegExp, string, number][] = [
  [/\bstorybook\b/, 'storybook', 6006],
  [/\bastro\b/, 'astro', 4321],
  [/\bnuxi?\b/, 'nuxt', 3000],
  [/\bnext\b/, 'next', 3000],
  [/\b(?:remix|react-router)\b/, 'react-router', 5173],
  [/\bvite\b/, 'vite', 5173],
]

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

function readText(path: string): string | null {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

// Single-quoted for the shell when it needs to be.
function quoted(word: string): string {
  return /^[\w@%+=:,./-]+$/.test(word)
    ? word
    : `'${word.replaceAll("'", `'\\''`)}'`
}

// Lowercase letters, digits and -, starting with a letter, at most 24.
export function slug(text: string): string {
  const cleaned = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^[^a-z]+/, '')
    .slice(0, MAX_NAME)
    .replace(/-+$/, '')
  return cleaned === '' ? 'service' : cleaned
}

// --port 3001, --port=3001, -p 3001 or PORT=3001 in a script.
export function portFlag(script: string): number | null {
  const match =
    /(?:^|\s)--port[=\s]+(\d+)/.exec(script) ??
    /(?:^|\s)-p\s+(\d+)/.exec(script) ??
    /(?:^|[\s;&])PORT=(\d+)/.exec(script)
  const port = match ? Number(match[1]) : null
  return port !== null && port >= 1 && port <= 65535 ? port : null
}

export function toolPort(
  script: string,
): { tool: string; port: number } | null {
  for (const [pattern, tool, port] of TOOL_PORTS) {
    if (pattern.test(script)) return { tool, port }
  }
  return null
}

// What its process's command line will hold: the last command of the script, without the
// variables set before it.
function scriptMatch(script: string): string {
  const last = script.split(/&&|\|\||;/).at(-1) ?? script
  return last.trim().replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)+/, '')
}

function isDevScript(name: string): boolean {
  return ['dev', 'start', 'serve'].includes(name) || name.endsWith(':dev')
}

function managerOf(root: string): Manager {
  return LOCKFILES.find(([file]) => existsSync(join(root, file)))?.[1] ?? 'npm'
}

interface Pkg {
  dir: string // relative to the root, '' for the root
  name: string | null
  scripts: Record<string, string>
}

function readPkg(root: string, dir: string): Pkg | null {
  const json = readJson(join(root, dir, 'package.json'))
  if (!isObject(json)) return null
  const scripts = isObject(json.scripts)
    ? Object.fromEntries(
        Object.entries(json.scripts).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string',
        ),
      )
    : {}
  return {
    dir,
    name: typeof json.name === 'string' ? json.name : null,
    scripts,
  }
}

// The workspace dirs package.json names: literal dirs, or a dir/* one level deep.
function workspaceDirs(root: string, json: Record<string, unknown>): string[] {
  const field = json.workspaces
  const patterns = Array.isArray(field)
    ? field
    : isObject(field) && Array.isArray(field.packages)
      ? field.packages
      : []
  return patterns
    .filter((pattern): pattern is string => typeof pattern === 'string')
    .flatMap((pattern) => {
      const clean = pattern.replace(/^\.\//, '').replace(/\/$/, '')
      if (!clean.endsWith('/*')) return clean.includes('*') ? [] : [clean]
      const parent = clean.slice(0, -2)
      if (parent.includes('*')) return []
      try {
        return readdirSync(join(root, parent), { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => join(parent, entry.name))
          .sort()
      } catch {
        return []
      }
    })
}

function runScript(manager: Manager, pkg: Pkg, script: string): string {
  if (pkg.dir === '') return `${manager} run ${script}`
  const name = pkg.name === null ? null : quoted(pkg.name)
  const dir = quoted(pkg.dir)
  switch (manager) {
    case 'npm':
      return name === null
        ? `npm run ${script} --prefix ${dir}`
        : `npm run ${script} -w ${name}`
    case 'pnpm':
      return name === null
        ? `pnpm --dir ${dir} run ${script}`
        : `pnpm --filter ${name} run ${script}`
    case 'yarn':
      return name === null
        ? `yarn --cwd ${dir} run ${script}`
        : `yarn workspace ${name} run ${script}`
    case 'bun':
      return name === null
        ? `bun --cwd ${dir} run ${script}`
        : `bun run --filter ${name} ${script}`
  }
}

// dev for the root's dev; web for packages/web's dev; web-api for packages/web's api:dev.
function scriptName(pkg: Pkg, script: string): string {
  const base = script.endsWith(':dev') ? script.slice(0, -4) : script
  if (pkg.dir === '') return base
  const short = (pkg.name ?? basename(pkg.dir)).replace(/^@[^/]+\//, '')
  return isDevScript(script) && !script.endsWith(':dev')
    ? short
    : `${short}-${base}`
}

function scriptStatus(script: string): {
  status: ServiceInput['status']
  note: string | null
} {
  const flagged = portFlag(script)
  if (flagged !== null)
    return { status: { port: { base: flagged } }, note: null }
  const tool = toolPort(script)
  if (tool !== null) {
    return {
      status: { port: { base: tool.port } },
      note: `port guessed from ${tool.tool}'s default`,
    }
  }
  return {
    status: { process: { match: scriptMatch(script) } },
    note: 'matches the script’s command line; a port check is surer if it listens on one',
  }
}

export function fromPackageJson(root: string): Suggestion[] {
  const json = readJson(join(root, 'package.json'))
  if (!isObject(json)) return []
  const manager = managerOf(root)
  const pkgs = [
    readPkg(root, ''),
    ...workspaceDirs(root, json).map((dir) => readPkg(root, dir)),
  ].filter((pkg) => pkg !== null)
  return pkgs.flatMap((pkg) =>
    Object.entries(pkg.scripts)
      .filter(([script]) => isDevScript(script))
      .map(([script, body]) => {
        const { status, note } = scriptStatus(body)
        return {
          name: scriptName(pkg, script),
          from: pkg.dir === '' ? 'package.json' : `${pkg.dir}/package.json`,
          service: { start: runScript(manager, pkg, script), status },
          note,
        }
      }),
  )
}

export async function fromMise(
  root: string,
  run: Runner,
): Promise<Suggestion[]> {
  // Fails when mise is missing or the config isn't trusted: either way there's nothing to offer.
  const listed = await run('mise', ['tasks', '--json'], {
    cwd: root,
    timeoutMs: LIST_TIMEOUT_MS,
  })
  if (listed.code !== 0) return []
  let tasks: unknown
  try {
    tasks = JSON.parse(listed.stdout)
  } catch {
    return []
  }
  if (!Array.isArray(tasks)) return []
  return tasks
    .map((task) =>
      isObject(task) && typeof task.name === 'string' ? task.name : '',
    )
    .filter((name) => /^(?:dev|start|serve|up)/.test(name))
    .map((task) => ({
      name: task,
      from: 'mise',
      service: {
        start: `mise run ${quoted(task)}`,
        status: { process: { match: `mise run ${task}` } },
      },
      note: `matches the mise process, so it reads up only while started with mise run ${task}`,
    }))
}

// The keys of a top-level `services:` block, by indentation: enough for a compose file, without a
// YAML parser.
export function composeServiceNames(yaml: string): string[] {
  const names: string[] = []
  let indent: number | null = null
  let inside = false
  for (const line of yaml.split('\n')) {
    if (line.trim() === '' || line.trim().startsWith('#')) continue
    const depth = line.length - line.trimStart().length
    if (depth === 0) {
      inside = /^services:\s*(?:#.*)?$/.test(line)
      continue
    }
    if (!inside) continue
    indent ??= depth
    if (depth !== indent) continue
    const key = /^\s*(?:"([^"]+)"|'([^']+)'|([^\s:#]+))\s*:/.exec(line)
    if (key) names.push(key[1] ?? key[2] ?? key[3])
  }
  return names
}

export async function fromCompose(
  root: string,
  run: Runner,
): Promise<Suggestion[]> {
  const file = COMPOSE_FILES.find((name) => existsSync(join(root, name)))
  if (file === undefined) return []
  const listed = await run('docker', ['compose', 'config', '--services'], {
    cwd: root,
    timeoutMs: LIST_TIMEOUT_MS,
  })
  const parts =
    listed.code === 0
      ? listed.stdout
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
      : composeServiceNames(readText(join(root, file)) ?? '')
  if (parts.length === 0) return []
  return [
    {
      name: basename(root),
      from: file,
      service: {
        start: 'docker compose up -d --wait',
        oneShot: true,
        status: { compose: { parts } },
      },
      note: null,
    },
  ]
}

export function fromProcfile(root: string): Suggestion[] {
  const text = readText(join(root, 'Procfile'))
  if (text === null) return []
  return text.split('\n').flatMap((line) => {
    const match = /^([A-Za-z0-9_-]+):\s*(.+)$/.exec(line.trim())
    if (!match) return []
    const command = match[2].trim()
    return [
      {
        name: match[1],
        from: 'Procfile',
        service: {
          start: command,
          status: { process: { match: scriptMatch(command) } },
        },
        note: 'matches the command as written; a $VARIABLE in it won’t be in the process’s command line',
      },
    ]
  })
}

// Names made schema Names and unique; a suggestion the schema refuses is dropped.
export function settle(suggestions: Suggestion[]): DetectedService[] {
  const taken = new Set<string>()
  return suggestions.flatMap((suggestion) => {
    if (!Service.safeParse(suggestion.service).success) return []
    const base = slug(suggestion.name)
    let name = base
    for (let n = 2; taken.has(name); n += 1) {
      const suffix = `-${n}`
      name = `${base.slice(0, MAX_NAME - suffix.length).replace(/-+$/, '')}${suffix}`
    }
    taken.add(name)
    return [{ ...suggestion, name }]
  })
}

export async function detectServices(
  root: string,
  run: Runner = runProgram,
): Promise<DetectedService[]> {
  const [mise, compose] = await Promise.all([
    fromMise(root, run),
    fromCompose(root, run),
  ])
  return settle([
    ...fromPackageJson(root),
    ...mise,
    ...compose,
    ...fromProcfile(root),
  ])
}
