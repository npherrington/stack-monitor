// A worktree for reviewing a PR: beside the primary, detached at the PR's head as the remote has
// it now. Detached, so there's no branch to clean up, and the usual removal takes it. One that is
// already there is moved to the PR's latest head, when nothing in it would be lost.
import { existsSync } from 'node:fs'

import { listRuns } from '../agents/runs.ts'
import { runsDir } from '../agents/run-files.ts'
import { Ref, type Config } from '../config/schema.ts'
import { loadRepoConfig } from '../repos.ts'
import { run } from '../run.ts'
import type { Tracking } from '../settings.ts'
import { canonical, listWorktrees, type Worktree } from './clone.ts'
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
  fork: boolean // its head is in another repo
}

export interface ReviewWorktree {
  path: string
  head: string // the commit it is at: the PR's head as fetched
  base: string // the ref the base branch was fetched into: origin/main
  message: string // what was made or moved
  log: string | null // the background install's log
}

type Refused = { refused: string }

// app-review-pr-21 beside /code/app.
export function reviewWorktreePath(root: string, number: number): string {
  return worktreePath(root, `review-pr-${number}`)
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

// Why a review worktree that's already there can't be moved, or whether a ref holds its HEAD:
// asked before the fetch, since a forced update takes the PR's old head out of its tracking ref.
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
  const holding = await run('git', [
    '-C',
    path,
    'for-each-ref',
    '--contains',
    'HEAD',
    '--count=1',
  ])
  return { held: holding.code === 0 && holding.stdout.trim() !== '' }
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
  const tracked = `refs/remotes/${remote}/pr/${number}`

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
          `+refs/pull/${number}/head:${tracked}`,
          `+refs/heads/${base}:refs/remotes/${remote}/${base}`,
        ],
        { timeoutMs: FETCH_TIMEOUT_MS },
      )
      if (fetched.code !== 0) {
        return {
          refused: `Couldn't fetch #${number} from ${remote}: ${tail(fetched)}`,
        }
      }
      const read = await run('git', [
        '-C',
        root,
        'rev-parse',
        '--verify',
        '--quiet',
        `${tracked}^{commit}`,
      ])
      const head = read.stdout.trim()
      if (read.code !== 0 || head === '') {
        return { refused: `The fetch left no commit for #${number}` }
      }
      const at = { path, head, base: `${remote}/${base}` }
      const short = head.slice(0, 7)

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
              head,
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
          head,
        ])
        if (moved.code !== 0) {
          return { refused: `git checkout failed in ${path}: ${tail(moved)}` }
        }
        return {
          ...at,
          message: `Moved ${path} to #${number}'s head, ${short}`,
          log: null,
        }
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
        head,
      ])
      if (added.code !== 0) {
        return { refused: `git worktree add failed: ${tail(added)}` }
      }
      const finished = await finishWorktree(root, path, null, config, index, {
        setup: !fork,
        install: !fork,
      })
      if ('refused' in finished) return finished
      const { setup, install } = config.worktrees
      const made = `Made ${path} at #${number}'s head, ${short}`
      const skipped = fork && (setup !== undefined || install !== undefined)
      return {
        ...at,
        message: skipped
          ? `${made}. It's a fork's PR, so the repo's setup and install weren't run`
          : finished.log === null
            ? made
            : `${made}. Installing in the background`,
        log: finished.log,
      }
    },
  )
}
