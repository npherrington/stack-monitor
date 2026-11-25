// The shapes the server answers with and the page reads. Imports nothing from Node, so the page
// can import it too.

import type {
  ServiceInput,
  StackInput,
  WorktreesInput,
} from './config/schema.ts'

// What every action answers: done or refused, what happened, and the log to look at when there is
// one.
export interface ActionResult {
  ok: boolean
  message: string
  log: string | null
}

export function failure(
  message: string,
  log: string | null = null,
): ActionResult {
  return { ok: false, message, log }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export const MODULE_NAMES = [
  'worktrees',
  'stack',
  'agents',
  'featureMap',
] as const
export type ModuleName = (typeof MODULE_NAMES)[number]
export type Modules = Record<ModuleName, boolean>

// A repo's config, as GET /api/repos answers it. source: the config file read, or null when there's none and the defaults apply.
export type ConfigStatus =
  | { ok: true; repo: string; source: string | null; modules: Modules }
  | { ok: false; repo: string; source: string; problem: string }

// A repo the monitor tracks, as GET /api/repos answers it. root is its primary checkout and its id.
// config: its stack-monitor.json as read now; null while the repo can't be read (gone, not git).
export interface RepoStatus {
  root: string
  name: string // what the page calls it: set when added, the folder name by default
  config: ConfigStatus | null
  problem: string | null // why the repo can't be read, or null
}

// A git repo GET /api/repos/scan found under the folder it was given.
export interface ScanHit {
  root: string // its primary checkout
  name: string
  worktrees: number
  tracked: boolean // already in the list
}

export interface ScanResult {
  folder: string // as resolved, ~ expanded
  hits: ScanHit[]
  truncated: boolean // stopped at the time or count limit before looking everywhere
}

export interface Checkout {
  path: string
  primary: boolean
  branch: string | null // null when detached
  head: string // short sha, '' when it can't be read
  changed: number // changed and untracked paths
  ahead: number | null // commits not on mainline; null when mainline doesn't resolve
  behind: number | null
  merged: boolean // on a branch whose commits all reached mainline through a merge
  locked: boolean
  prunable: boolean // git still lists it but its directory is gone
  problem: string | null // why its git state couldn't be read
  services: ServiceState[] // the repo's stack, read in this checkout; empty without one
}

export interface RepoCheckouts {
  root: string
  name: string
  mainline: string
  checkouts: Checkout[] // primary first
  services: string[] // the stack's service names, in declared order; empty without a stack
  problem: string | null // why the repo couldn't be read; checkouts is empty then
}

// GET /api/checkouts: every tracked repo's worktrees, in the order the repos were added.
export interface CheckoutsSnapshot {
  repos: RepoCheckouts[]
}

// How a service reads in one checkout. partial: some of a compose service's parts are up.
// unknown: its status couldn't be read (docker not running, an env file without the port key, a
// command check from a config this machine hasn't trusted).
export type ServiceStateName = 'up' | 'partial' | 'down' | 'unknown'

export interface ServiceState {
  name: string
  state: ServiceStateName
  detail: string | null // what was found or why it's unknown: "port 5173", "1 of 2 containers"
}

// GET /api/repos/stack?root=: the stack in effect for a repo, and where Save writes.
export interface RepoStack {
  root: string
  stack: StackInput | null // null: no stack section in the config in effect
  source: string | null // the config file it came from; null when there's none
  personal: string // the file on this machine POST /api/repos/stack writes
  editable: boolean // false when the config in effect isn't the personal file (Save copies it)
}

// GET /api/repos/detect?root=: services the repo's own files suggest, for the editor to offer.
export interface DetectedService {
  name: string
  from: string // where it was found: "package.json", "mise", "compose.yaml", "Procfile"
  service: ServiceInput
  note: string | null // what to check before trusting the guess, e.g. "port guessed from vite's default"
}

// GET /api/repos/worktrees?root=: how the repo makes worktrees, as its config in effect has it.
export interface RepoWorktrees {
  root: string
  worktrees: WorktreesInput // {} when the config has no worktrees section
  source: string | null
  personal: string // the file on this machine POST /api/repos/worktrees writes
  editable: boolean
}

export type WorktreeCommandRole = 'create' | 'setup' | 'install' | 'teardown'

// GET /api/repos/detect-worktrees?root=: commands the repo's files suggest for each role.
export interface DetectedWorktreeCommand {
  role: WorktreeCommandRole
  command: string // create commands carry {branch}
  from: string // "mise", "package.json", "scripts/", "Makefile", "justfile", "package-lock.json"
  note: string | null // what to check before trusting the guess
}
