// Worktree commands a repo's own files suggest, for the worktrees editor to offer. Reads only:
// nothing suggested is run, but for mise's listing of its tasks.
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { BRANCH } from '../config/schema.ts'
import { run as runProgram } from '../run.ts'
import {
  isObject,
  managerOf,
  miseTaskNames,
  quoted,
  readJson,
  readText,
  type Runner,
} from '../stack/detect.ts'
import type { DetectedWorktreeCommand, WorktreeCommandRole } from '../types.ts'

// Checked in order: a frozen install for each lockfile at the root.
const INSTALLS: [string, string][] = [
  ['package-lock.json', 'npm ci'],
  ['pnpm-lock.yaml', 'pnpm install --frozen-lockfile'],
  ['yarn.lock', 'yarn install --immutable'],
  ['bun.lock', 'bun install --frozen-lockfile'],
  ['bun.lockb', 'bun install --frozen-lockfile'],
  ['uv.lock', 'uv sync'],
  ['poetry.lock', 'poetry install'],
  ['Gemfile.lock', 'bundle install'],
  ['Cargo.lock', 'cargo fetch'],
]
const MISE_CONFIGS = ['mise.toml', '.mise.toml']
const MAKEFILES = ['GNUmakefile', 'makefile', 'Makefile']
const JUSTFILES = ['justfile', 'Justfile', '.justfile']

const SETUP_WORDS = new Set(['setup', 'init', 'bootstrap'])
const TEARDOWN_WORDS = new Set(['remove', 'rm', 'clean', 'cleanup', 'teardown'])
// A task that only looks at worktrees makes none.
const LOOK_WORDS = new Set(['list', 'ls', 'status', 'show', 'prune'])

type Hook = Exclude<WorktreeCommandRole, 'install'>

// newWorktree, new-worktree and wt:new all read as words.
function words(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

// What a task, script or target named this does for a worktree, or null when it isn't about
// worktrees.
export function worktreeRole(name: string): Hook | null {
  const said = words(name)
  if (!said.some((word) => word.includes('worktree') || word === 'wt')) {
    return null
  }
  if (said.some((word) => LOOK_WORDS.has(word))) return null
  if (said.some((word) => SETUP_WORDS.has(word))) return 'setup'
  if (said.some((word) => TEARDOWN_WORDS.has(word))) return 'teardown'
  return 'create'
}

// How one runner calls a thing it names: alone for setup and teardown, which run in the
// worktree, and with the branch for create, which makes it.
interface Runnable {
  name: string
  from: string
  plain: string
  withBranch: string
  note: string // what to check about how it takes the branch
}

function suggest({
  name,
  from,
  plain,
  withBranch,
  note,
}: Runnable): DetectedWorktreeCommand[] {
  const role = worktreeRole(name)
  if (role === null) return []
  return role === 'create'
    ? [{ role, command: withBranch, from, note }]
    : [{ role, command: plain, from, note: null }]
}

export async function fromMise(
  root: string,
  run: Runner,
): Promise<DetectedWorktreeCommand[]> {
  return (await miseTaskNames(root, run)).flatMap((task) =>
    suggest({
      name: task,
      from: 'mise',
      plain: `mise run ${quoted(task)}`,
      withBranch: `mise run ${quoted(task)} -- ${BRANCH}`,
      note: 'check that the task takes the branch as its first argument: mise run passes on what follows --',
    }),
  )
}

export function fromPackageJson(root: string): DetectedWorktreeCommand[] {
  const json = readJson(join(root, 'package.json'))
  if (!isObject(json) || !isObject(json.scripts)) return []
  const manager = managerOf(root)
  // npm alone needs -- before arguments meant for the script.
  const separator = manager === 'npm' ? ' --' : ''
  return Object.entries(json.scripts)
    .filter(([, body]) => typeof body === 'string')
    .flatMap(([script]) =>
      suggest({
        name: script,
        from: 'package.json',
        plain: `${manager} run ${quoted(script)}`,
        withBranch: `${manager} run ${quoted(script)}${separator} ${BRANCH}`,
        note: `check that the script takes the branch as its first argument: ${manager} run adds it to the end of the script`,
      }),
    )
}

// The files in scripts/ someone can run.
function executables(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((file) => {
        if (file.startsWith('.')) return false
        const stat = statSync(join(dir, file))
        return stat.isFile() && (stat.mode & 0o111) !== 0
      })
      .toSorted()
  } catch {
    return []
  }
}

export function fromScripts(root: string): DetectedWorktreeCommand[] {
  return executables(join(root, 'scripts')).flatMap((file) => {
    const path = quoted(`scripts/${file}`)
    return suggest({
      name: file,
      from: 'scripts/',
      plain: path,
      withBranch: `${path} ${BRANCH}`,
      note: 'check that the script takes the branch as its first argument',
    })
  })
}

// Variable assignments: NAME = x, NAME := x, NAME ::= x, NAME ?= x, NAME += x, NAME != x.
const MAKE_ASSIGNMENT = /^[^\s:#=]+\s*(?:::?=|:::=|[?+!]?=)/
const MAKE_RULE = /^([\w./-]+(?:[ \t]+[\w./-]+)*)[ \t]*::?(?!=)/

// The explicit targets of a Makefile's rules, without the special .TARGETS or % patterns.
export function makeTargets(text: string): string[] {
  const targets = new Set<string>()
  for (const line of text.split('\n')) {
    if (MAKE_ASSIGNMENT.test(line)) continue
    const rule = MAKE_RULE.exec(line)
    if (rule === null) continue
    for (const target of rule[1].split(/\s+/)) {
      if (!target.startsWith('.')) targets.add(target)
    }
  }
  return [...targets]
}

// A recipe's first line: @name params: deps. Settings, aliases and assignments use :=, which the
// lookahead turns away.
const JUST_RECIPE = /^@?([A-Za-z_][\w-]*)[^:]*:(?!=)/

export function justRecipes(text: string): string[] {
  const recipes = new Set<string>()
  for (const line of text.split('\n')) {
    const recipe = JUST_RECIPE.exec(line)
    if (recipe !== null) recipes.add(recipe[1])
  }
  return [...recipes]
}

// The names at the root, to match exactly: on a case-insensitive disk existsSync('makefile') would
// find Makefile and name it wrong.
function rootFiles(root: string): string[] {
  try {
    return readdirSync(root)
  } catch {
    return []
  }
}

function firstFile(root: string, names: string[]): string | null {
  const listed = rootFiles(root)
  return names.find((name) => listed.includes(name)) ?? null
}

export function fromMakefile(root: string): DetectedWorktreeCommand[] {
  const file = firstFile(root, MAKEFILES)
  if (file === null) return []
  return makeTargets(readText(join(root, file)) ?? '').flatMap((target) =>
    suggest({
      name: target,
      from: file,
      plain: `make ${quoted(target)}`,
      withBranch: `make ${quoted(target)} BRANCH=${BRANCH}`,
      note: 'check that the target reads the branch from $(BRANCH)',
    }),
  )
}

export function fromJustfile(root: string): DetectedWorktreeCommand[] {
  const file = firstFile(root, JUSTFILES)
  if (file === null) return []
  return justRecipes(readText(join(root, file)) ?? '').flatMap((recipe) =>
    suggest({
      name: recipe,
      from: file,
      plain: `just ${quoted(recipe)}`,
      withBranch: `just ${quoted(recipe)} ${BRANCH}`,
      note: 'check that the recipe takes the branch as its first parameter',
    }),
  )
}

// A frozen install for each lockfile at the root, and mise install for a mise config.
export function installs(root: string): DetectedWorktreeCommand[] {
  const listed = rootFiles(root)
  const found: DetectedWorktreeCommand[] = INSTALLS.filter(([file]) =>
    listed.includes(file),
  ).map(([file, command]) => ({
    role: 'install',
    command,
    from: file,
    note: null,
  }))
  const mise = firstFile(root, MISE_CONFIGS)
  if (mise !== null) {
    found.push({
      role: 'install',
      command: 'mise install',
      from: mise,
      note: null,
    })
  }
  return found
}

export async function detectWorktreeCommands(
  root: string,
  run: Runner = runProgram,
): Promise<DetectedWorktreeCommand[]> {
  return [
    ...(await fromMise(root, run)),
    ...fromPackageJson(root),
    ...fromScripts(root),
    ...fromMakefile(root),
    ...fromJustfile(root),
    ...installs(root),
  ]
}
