// The app's "Update from main…": whether its own checkout can be fast-forwarded to origin/main.
// Read in the app before it quits, so a refusal or "up to date" never stops it. No electron import,
// so the tests load it under plain node.
import { run, type RunResult } from '../core/run.ts'

const BRANCH = 'main'
const UPSTREAM = 'origin/main'
const GIT_TIMEOUT_MS = 30_000
const LISTED = 10

export interface UpdateState {
  root: string
  branch: string | null // null when HEAD is detached
  changed: string[]
  // Why origin/main couldn't be read: the fetch, or a read after it. Not read at all (null, with
  // the counts at 0) when the branch or changed files already refuse.
  remoteError: string | null
  ahead: number
  behind: number
  target: string // origin/main's commit as fetched
  commits: string[] // `git log --oneline` of HEAD..target, newest first
  mise: boolean
}

export type UpdateDecision =
  | { kind: 'refuse'; message: string }
  | { kind: 'current' }
  | { kind: 'ready'; target: string; behind: number; commits: string[] }

const git = (root: string, ...args: string[]) =>
  run('git', ['-C', root, ...args], {
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    timeoutMs: GIT_TIMEOUT_MS,
  })

const failure = (what: string, result: RunResult) =>
  `${what} failed: ${result.stderr.trim() || `exited with ${result.code}`}`

// `mise` is the program the update script will run; tests name another.
export async function readUpdateState(
  root: string,
  { mise = 'mise' }: { mise?: string } = {},
): Promise<UpdateState> {
  const [head, status, misePresent] = await Promise.all([
    git(root, 'symbolic-ref', '--short', '-q', 'HEAD'),
    git(root, 'status', '--porcelain'),
    run(mise, ['--version']),
  ])
  const local = {
    root,
    branch: head.code === 0 ? head.stdout.trim() : null,
    changed: status.stdout
      .split('\n')
      .filter((line) => line !== '')
      .map((line) => line.slice(3)),
    mise: misePresent.code === 0,
  }
  const unread = {
    remoteError: null,
    ahead: 0,
    behind: 0,
    target: '',
    commits: [],
  }
  if (status.code !== 0) {
    return { ...local, ...unread, remoteError: failure('git status', status) }
  }
  if (local.branch !== BRANCH || local.changed.length > 0) {
    return { ...local, ...unread }
  }
  const fetched = await git(root, 'fetch', '--quiet', 'origin', BRANCH)
  if (fetched.code !== 0) {
    return {
      ...local,
      ...unread,
      remoteError: failure(`git fetch origin ${BRANCH}`, fetched),
    }
  }
  const target = await git(
    root,
    'rev-parse',
    '--verify',
    '-q',
    `${UPSTREAM}^{commit}`,
  )
  if (target.code !== 0) {
    return {
      ...local,
      ...unread,
      remoteError: `${UPSTREAM} doesn't resolve after the fetch`,
    }
  }
  const sha = target.stdout.trim()
  // Both against the sha, so the listed commits are the ones the update installs.
  const [counts, log] = await Promise.all([
    git(root, 'rev-list', '--left-right', '--count', `HEAD...${sha}`),
    git(root, 'log', '--oneline', `-n${LISTED}`, `HEAD..${sha}`),
  ])
  if (counts.code !== 0) {
    return { ...local, ...unread, remoteError: failure('git rev-list', counts) }
  }
  if (log.code !== 0) {
    return { ...local, ...unread, remoteError: failure('git log', log) }
  }
  const [ahead = 0, behind = 0] = counts.stdout.trim().split(/\s+/).map(Number)
  return {
    ...local,
    remoteError: null,
    ahead,
    behind,
    target: sha,
    commits: log.stdout.split('\n').filter((line) => line !== ''),
  }
}

const refuse = (message: string): UpdateDecision => ({
  kind: 'refuse',
  message,
})

export function decideUpdate(state: UpdateState): UpdateDecision {
  if (state.branch !== BRANCH) {
    const on =
      state.branch === null ? 'a detached HEAD' : `the branch ${state.branch}`
    return refuse(
      `${state.root} is on ${on}. Only ${BRANCH} is updated: check it out there, then update.`,
    )
  }
  if (state.changed.length > 0) {
    const shown = state.changed.slice(0, LISTED).join(', ')
    const more =
      state.changed.length > LISTED
        ? ` and ${state.changed.length - LISTED} more`
        : ''
    return refuse(
      `${state.root} has changed files: ${shown}${more}. Commit them or put them aside, then update.`,
    )
  }
  if (state.remoteError !== null) return refuse(state.remoteError)
  if (!state.mise) {
    return refuse(
      "mise isn't on the app's PATH. Run mise run install-app from a terminal that has it.",
    )
  }
  if (state.ahead > 0) {
    return refuse(
      `${BRANCH} has ${state.ahead} commit${state.ahead === 1 ? '' : 's'} that ${UPSTREAM} doesn't. Push or drop them, then update.`,
    )
  }
  if (state.behind === 0) return { kind: 'current' }
  return {
    kind: 'ready',
    target: state.target,
    behind: state.behind,
    commits: state.commits,
  }
}
