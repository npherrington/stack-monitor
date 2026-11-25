// Every tracked repo's checkouts and the git state of each, read now.
import { existsSync } from 'node:fs'

import type { LoadedConfig } from '../config/load.ts'
import { DEFAULT_MAINLINE, type StackConfig } from '../config/schema.ts'
import { configWhere, loadRepoConfig } from '../repos.ts'
import { run } from '../run.ts'
import { readRepoList, type TrackedRepo, type Tracking } from '../settings.ts'
import { readMachine, type Machine } from '../stack/machine.ts'
import {
  envReader,
  goneStates,
  machineNeeds,
  readIndex,
  readServiceStates,
} from '../stack/status.ts'
import {
  errorMessage,
  type Checkout,
  type CheckoutsSnapshot,
  type RepoCheckouts,
} from '../types.ts'
import {
  canonical,
  listWorktrees,
  whyUnreadable,
  type Worktree,
} from './clone.ts'

// A wedged checkout (a hung filesystem, a huge untracked tree) mustn't hold up the snapshot.
const GIT_STATE_TIMEOUT_MS = 10_000

export interface TreeStatus {
  branch: string | null // null when detached
  oid: string
  changed: number
}

const BRANCH_OID = '# branch.oid '
const BRANCH_HEAD = '# branch.head '

// `git status --porcelain=v2 --branch`: `# branch.*` header lines, then a line per changed or
// untracked path.
export function parseStatus(porcelain: string): TreeStatus {
  const status: TreeStatus = { branch: null, oid: '', changed: 0 }
  for (const line of porcelain.split('\n').filter(Boolean)) {
    if (line.startsWith(BRANCH_OID)) {
      status.oid = line.slice(BRANCH_OID.length)
    } else if (line.startsWith(BRANCH_HEAD)) {
      const name = line.slice(BRANCH_HEAD.length)
      status.branch = name === '(detached)' ? null : name
    } else if (!line.startsWith('#')) {
      status.changed += 1
    }
  }
  return status
}

// The mainline's own commits, without what its merges brought in. Shared by every checkout of the
// repo, so read once per snapshot. null when the mainline doesn't resolve.
export async function readMainline(
  root: string,
  mainline: string,
): Promise<Set<string> | null> {
  const { code, stdout } = await run('git', [
    '-C',
    root,
    'rev-list',
    '--first-parent',
    mainline,
  ])
  return code === 0 ? new Set(stdout.split('\n').filter(Boolean)) : null
}

export type GitState = Pick<
  Checkout,
  'branch' | 'head' | 'changed' | 'ahead' | 'behind' | 'merged'
>

// --no-optional-locks: a plain `git status` may take index.lock to refresh stat info, and polling
// every checkout would then collide with another session's `git add`.
export async function readGitState(
  path: string,
  mainline: string,
  mainlineCommits: Set<string> | null,
): Promise<GitState | { problem: string }> {
  const timeoutMs = GIT_STATE_TIMEOUT_MS
  const [status, counts] = await Promise.all([
    run(
      'git',
      [
        '--no-optional-locks',
        '-C',
        path,
        'status',
        '--porcelain=v2',
        '--branch',
      ],
      { timeoutMs },
    ),
    run(
      'git',
      ['-C', path, 'rev-list', '--left-right', '--count', `${mainline}...HEAD`],
      { timeoutMs },
    ),
  ])
  if (status.code !== 0) {
    return { problem: `git status failed: ${status.stderr.trim()}` }
  }
  const { branch, oid, changed } = parseStatus(status.stdout)
  const [behind, ahead] =
    counts.code === 0
      ? counts.stdout.trim().split(/\s+/).map(Number)
      : [null, null]
  // 0 ahead alone doesn't say merged: a branch cut from the mainline with no commits yet is 0
  // ahead too, but its HEAD sits on the mainline's first-parent line.
  const merged =
    branch !== null &&
    ahead === 0 &&
    mainlineCommits !== null &&
    !mainlineCommits.has(oid)
  return { branch, head: oid.slice(0, 7), changed, ahead, behind, merged }
}

const UNREAD: GitState = {
  branch: null,
  head: '',
  changed: 0,
  ahead: null,
  behind: null,
  merged: false,
}

// What a repo's checkouts are read against: its config in effect, and whether that's the personal
// file, the only one whose command checks run.
interface RepoContext {
  config: LoadedConfig
  stack: StackConfig | null
  trusted: boolean
}

// Everything a checkout's services are read against, shared by the whole snapshot.
interface Machinery {
  machine: Promise<Machine> | null // null when no repo has a stack
  roots: string[] // every checkout's path across the repos
}

async function readServices(
  path: string,
  gone: boolean,
  { config, stack, trusted }: RepoContext,
  { machine, roots }: Machinery,
): Promise<Checkout['services']> {
  if (stack === null || machine === null || !config.ok) return []
  if (gone) return goneStates(stack)
  const readEnv = envReader(path)
  const index = readIndex(config.config, readEnv)
  return readServiceStates(
    stack,
    await machine,
    { path, roots, index, readEnv },
    trusted,
  )
}

async function readCheckout(
  worktree: Worktree,
  primary: boolean,
  mainline: string,
  mainlineCommits: Set<string> | null,
  context: RepoContext,
  machinery: Machinery,
): Promise<Checkout> {
  const gone = worktree.prunable || !existsSync(worktree.path)
  const facts = {
    path: canonical(worktree.path),
    primary,
    locked: worktree.locked,
    prunable: worktree.prunable,
  }
  const [state, services] = await Promise.all([
    gone
      ? { problem: 'Its directory is gone' }
      : readGitState(facts.path, mainline, mainlineCommits),
    readServices(facts.path, gone, context, machinery),
  ])
  return 'problem' in state
    ? { ...facts, ...UNREAD, problem: state.problem, services }
    : { ...facts, ...state, problem: null, services }
}

// A repo's config and worktree list, read before the machine so one read covers every stack.
interface Listed {
  repo: Pick<RepoCheckouts, 'root' | 'name' | 'mainline' | 'services'>
  context: RepoContext
  worktrees: Worktree[] | { problem: string }
}

async function listRepo(
  tracking: Tracking,
  { root, name }: TrackedRepo,
): Promise<Listed> {
  const config = loadRepoConfig(tracking, root)
  // A broken config is reported by /api/repos; the checkouts still read against the default.
  const mainline = config.ok ? config.config.mainline : DEFAULT_MAINLINE
  const stack = (config.ok && config.config.stack) || null
  const context: RepoContext = {
    config,
    stack,
    trusted: config.path === configWhere(tracking, root).personal,
  }
  const services = stack === null ? [] : Object.keys(stack.services)
  const repo = { root, name, mainline, services }
  const unreadable = await whyUnreadable(root)
  if (unreadable !== null) {
    return { repo, context, worktrees: { problem: unreadable } }
  }
  try {
    return { repo, context, worktrees: await listWorktrees(root) }
  } catch (error) {
    return { repo, context, worktrees: { problem: errorMessage(error) } }
  }
}

async function readRepoCheckouts(
  { repo, context, worktrees }: Listed,
  machinery: Machinery,
): Promise<RepoCheckouts> {
  if ('problem' in worktrees) {
    return { ...repo, checkouts: [], problem: worktrees.problem }
  }
  const mainlineCommits = await readMainline(repo.root, repo.mainline)
  const checkouts = await Promise.all(
    worktrees.map((worktree, at) =>
      readCheckout(
        worktree,
        at === 0,
        repo.mainline,
        mainlineCommits,
        context,
        machinery,
      ),
    ),
  )
  return { ...repo, checkouts, problem: null }
}

// The machine is read once, alongside the git reads, and only when some repo has a stack.
export async function readCheckouts(
  tracking: Tracking,
): Promise<CheckoutsSnapshot | { problem: string }> {
  const list = readRepoList(tracking.settings, tracking.seed)
  if ('problem' in list) return list
  const listed = await Promise.all(
    list.repos.map((repo) => listRepo(tracking, repo)),
  )
  const stacks = listed.flatMap(({ context }) =>
    context.stack === null ? [] : [context.stack],
  )
  const machinery: Machinery = {
    machine: stacks.length === 0 ? null : readMachine(machineNeeds(stacks)),
    roots: listed.flatMap(({ worktrees }) =>
      'problem' in worktrees
        ? []
        : worktrees.map((worktree) => canonical(worktree.path)),
    ),
  }
  return {
    repos: await Promise.all(
      listed.map((repo) => readRepoCheckouts(repo, machinery)),
    ),
  }
}
