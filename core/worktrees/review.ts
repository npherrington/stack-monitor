// A worktree for reviewing a PR, beside the primary and on no branch, so there's no branch to
// clean up and the usual removal takes it. For a PR from the repo itself it stands at the PR's
// head. For a fork's PR it stands on the base branch with the PR's head fetched beside it: an
// agent started in a checkout loads that checkout's CLAUDE.md, skills, hooks and settings, and a
// stranger's must never be on disk there. One that's already there is moved, when nothing in it
// would be lost.
import { existsSync } from 'node:fs'

import { listRuns } from '../agents/runs.ts'
import { runsDir } from '../agents/run-files.ts'
import { Ref, type Config } from '../config/schema.ts'
import { loadRepoConfig } from '../repos.ts'
import { run } from '../run.ts'
import type { Tracking } from '../settings.ts'
import { canonical, headIsHeld, listWorktrees, type Worktree } from './clone.ts'
import {
  alreadyMaking,
  finishWorktree,
  freeIndex,
  makingIn,
  tail,
  worktreePath,
} from './create.ts'

const FETCH_TIMEOUT_MS = 2 * 60_000

export interface ReviewTarget {
  number: number
  base: string // the PR's base branch, as GitHub names it
  head: string // the PR's head commit, as GitHub names it
  fork: boolean // its head is in another repo
}

export interface ReviewWorktree {
  path: string
  head: string // the PR's head as fetched: what the review reads
  base: string // the ref the base branch was fetched into: origin/main
  stands: 'head' | 'base' // where the worktree is: base for a fork's PR
  message: string // what was made or moved
  log: string | null // the background install's log
}

type Refused = { refused: string }

// app-review-pr-21 beside /code/app.
export function reviewWorktreePath(root: string, number: number): string {
  return worktreePath(root, `review-pr-${number}`)
}

// Where a PR's head is kept once fetched. Outside refs/remotes, so a pruning fetch leaves it and
// it can't meet a real branch named pr/<n>.
export function pullRef(number: number): string {
  return `refs/stack-monitor/pr/${number}`
}

// The remote PR refs are fetched from: the mainline's when it names one the clone has, else
// origin.
async function pullRemote(
  root: string,
  config: Config,
): Promise<string | null> {
  const listed = await run('git', ['-C', root, 'remote'])
  const remotes = listed.stdout.split('\n').filter(Boolean)
  const [named] = config.mainline.split('/')
  if (config.mainline.includes('/') && remotes.includes(named)) return named
  return remotes.includes('origin') ? 'origin' : null
}

async function commitAt(root: string, ref: string): Promise<string | null> {
  const read = await run('git', [
    '-C',
    root,
    'rev-parse',
    '--verify',
    '--quiet',
    `${ref}^{commit}`,
  ])
  const commit = read.stdout.trim()
  return read.code === 0 && commit !== '' ? commit : null
}

// Why a review worktree that's already there can't be moved, or whether a ref holds its HEAD:
// asked before the fetch, since a forced update takes the PR's old head out of its ref.
async function movable(
  root: string,
  worktree: Worktree,
  runs: string,
): Promise<{ held: boolean } | Refused> {
  const { path } = worktree
  if (worktree.locked) {
    return {
      refused: `${path} is locked (git worktree lock). Unlock it to review in it.`,
    }
  }
  if (worktree.prunable) {
    return {
      refused: `${path} is gone: git still lists it, but its folder isn't there. Remove it on the Worktrees page, then start again.`,
    }
  }
  if (worktree.branch !== null) {
    return {
      refused: `${path} is on ${worktree.branch} now, so it isn't the review worktree any more. Remove it, or pick it as the checkout.`,
    }
  }
  const status = await run('git', ['-C', path, 'status', '--porcelain'])
  if (status.code !== 0) {
    return { refused: `git status failed in ${path}: ${tail(status)}` }
  }
  const changed = status.stdout.split('\n').filter((line) => line.trim()).length
  if (changed > 0) {
    return {
      refused: `${path} has ${changed} changed or untracked ${changed === 1 ? 'file' : 'files'}. Commit, stash or delete ${changed === 1 ? 'it' : 'them'} first.`,
    }
  }
  const going = (await listRuns(runs, root)).find(
    (each) =>
      each.state === 'running' && canonical(each.checkout) === canonical(path),
  )
  if (going !== undefined) {
    return {
      refused: `"${going.title}" is running in ${path}. Stop it or wait for it to end.`,
    }
  }
  return { held: await headIsHeld(path) }
}

export async function makeReviewWorktree(
  tracking: Tracking,
  root: string,
  target: ReviewTarget,
  { runs = runsDir() }: { runs?: string } = {},
): Promise<ReviewWorktree | Refused> {
  const { number, base, fork } = target
  const loaded = loadRepoConfig(tracking, root)
  if (!loaded.ok) return { refused: loaded.problem }
  const { config } = loaded
  // The base branch's name comes from GitHub and goes into a refspec.
  const named =
    Ref.safeParse(base).success &&
    (await run('git', ['check-ref-format', '--branch', base])).code === 0
  if (!named) {
    return {
      refused: `#${number}'s base branch isn't a name the monitor hands to git`,
    }
  }
  const remote = await pullRemote(root, config)
  if (remote === null) {
    return { refused: `${root} has no remote to fetch #${number} from` }
  }
  const path = reviewWorktreePath(root, number)
  const baseRef = `${remote}/${base}`

  return makingIn<ReviewWorktree | Refused>(
    root,
    { refused: alreadyMaking(root) },
    async () => {
      const existing = (await listWorktrees(root)).find(
        (each) => canonical(each.path) === canonical(path),
      )
      if (existing === undefined && existsSync(path)) {
        return {
          refused: `${path} already exists and isn't a worktree of ${root}`,
        }
      }
      const before =
        existing === undefined ? null : await movable(root, existing, runs)
      if (before !== null && 'refused' in before) return before

      const fetched = await run(
        'git',
        [
          '-C',
          root,
          'fetch',
          '--no-tags',
          '--quiet',
          remote,
          `+refs/pull/${number}/head:${pullRef(number)}`,
          `+refs/heads/${base}:refs/remotes/${baseRef}`,
        ],
        { timeoutMs: FETCH_TIMEOUT_MS },
      )
      if (fetched.code !== 0) {
        return {
          refused: `Couldn't fetch #${number} from ${remote}: ${tail(fetched)}`,
        }
      }
      const head = await commitAt(root, pullRef(number))
      const baseHead = await commitAt(root, `refs/remotes/${baseRef}`)
      if (head === null || baseHead === null) {
        return {
          refused: `The fetch left no commit for ${head === null ? `#${number}` : baseRef}`,
        }
      }
      // The remote the clone fetches from may not be the repo gh reads the PR from (a fork's
      // clone, say), and its PR of the same number would be somebody else's change.
      if (head !== target.head) {
        return {
          refused: `${remote} holds ${head.slice(0, 7)} for #${number}, and GitHub names ${target.head.slice(0, 7)} as its head. If it was pushed to just now, start the review again; otherwise ${remote} isn't the repo this PR is on.`,
        }
      }
      const stands = fork ? 'base' : 'head'
      const commit = fork ? baseHead : head
      const short = head.slice(0, 7)
      const where = fork
        ? `at ${baseRef}, with #${number}'s head ${short} fetched to read from there (a fork's PR isn't checked out)`
        : `at #${number}'s head, ${short}`
      const at = { path, head, base: baseRef, stands } as const

      if (before !== null) {
        // A commit made here that no ref holds would be left to the reflog by the move.
        const kept =
          before.held ||
          (
            await run('git', [
              '-C',
              path,
              'merge-base',
              '--is-ancestor',
              'HEAD',
              commit,
            ])
          ).code === 0
        if (!kept) {
          return {
            refused: `${path} is at a commit nothing else holds. Put it on a branch, or remove the worktree, and start again.`,
          }
        }
        const moved = await run('git', [
          '-C',
          path,
          'checkout',
          '--quiet',
          '--detach',
          commit,
        ])
        if (moved.code !== 0) {
          return { refused: `git checkout failed in ${path}: ${tail(moved)}` }
        }
        return { ...at, message: `Put ${path} ${where}`, log: null }
      }

      const index = await freeIndex(root, config)
      if (typeof index === 'string') return { refused: index }
      const added = await run('git', [
        '-C',
        root,
        'worktree',
        'add',
        '--quiet',
        '--detach',
        path,
        commit,
      ])
      if (added.code !== 0) {
        return { refused: `git worktree add failed: ${tail(added)}` }
      }
      // Setup and install run what's checked out: the PR's own tree, or the base for a fork.
      const finished = await finishWorktree(root, path, null, config, index)
      if ('refused' in finished) return finished
      const made = `Made ${path} ${where}`
      return {
        ...at,
        message:
          finished.log === null
            ? made
            : `${made}. Installing in the background`,
        log: finished.log,
      }
    },
  )
}
