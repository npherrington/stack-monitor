import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { describe, test } from 'node:test'

import { META_FILE } from '../core/agents/run-files.ts'
import type { Tracking } from '../core/settings.ts'
import { readCheckouts } from '../core/worktrees/checkouts.ts'
import { INSTALLS_ENV } from '../core/worktrees/create.ts'
import { removeWorktree } from '../core/worktrees/remove.ts'
import {
  makeReviewWorktree,
  pullRef,
  reviewWorktreePath,
  type ReviewWorktree,
} from '../core/worktrees/review.ts'
import {
  cloneWithOrigin,
  git,
  pushPull,
  tempDir,
  writeJson,
} from './fixtures.ts'

delete process.env.STACK_MONITOR_CONFIG

function fixture(worktrees: Record<string, unknown> = {}) {
  const root = tempDir()
  const clone = cloneWithOrigin(root)
  const { primary } = clone
  writeJson(join(primary, 'stack-monitor.json'), { worktrees })
  process.env[INSTALLS_ENV] = join(root, 'installs')
  const tracking: Tracking = {
    settings: join(root, 'settings.json'),
    seed: primary,
  }
  const runs = join(root, 'runs')
  // head: the commit GitHub names; by default, the one the origin holds for the PR now.
  const review = (
    number: number,
    target: { base?: string; fork?: boolean; head?: string } = {},
  ) =>
    makeReviewWorktree(
      tracking,
      primary,
      {
        number,
        base: 'main',
        fork: false,
        head: pulled(clone.origin, number),
        ...target,
      },
      { runs },
    )
  return { root, primary, tracking, runs, review }
}

function made(result: ReviewWorktree | { refused: string }): ReviewWorktree {
  assert.ok(!('refused' in result), 'refused' in result ? result.refused : '')
  return result
}

const headOf = (path: string) => git(path, 'rev-parse', 'HEAD').trim()
// The PR's head as the bare origin holds it; '' when it has no such PR.
function pulled(origin: string, number: number): string {
  try {
    return git(origin, 'rev-parse', `refs/pull/${number}/head`).trim()
  } catch {
    return ''
  }
}
const branchOf = (path: string) =>
  git(path, 'rev-parse', '--abbrev-ref', 'HEAD').trim()

describe('a review worktree', () => {
  test("makes a detached worktree at the PR's head beside the primary, with its index written and setup run", async () => {
    const { primary, review } = fixture({
      index: { file: '.env.local', key: 'WT' },
      setup: 'echo "setup {index} [{branch}]" > made.txt',
      install: 'echo installed',
    })
    const sha = pushPull(primary, 7, 'the change')
    const worktree = made(await review(7))
    assert.equal(worktree.path, reviewWorktreePath(primary, 7))
    assert.match(worktree.path, /app-review-pr-7$/)
    assert.equal(worktree.head, sha)
    assert.equal(worktree.base, 'origin/main')
    assert.equal(worktree.stands, 'head')
    assert.equal(headOf(worktree.path), sha)
    // Kept where a pruning fetch leaves it, and no remote branch is made up for it.
    assert.equal(git(primary, 'rev-parse', pullRef(7)).trim(), sha)
    git(primary, 'fetch', '-q', '--prune', 'origin')
    assert.equal(git(primary, 'rev-parse', pullRef(7)).trim(), sha)
    assert.equal(git(primary, 'branch', '-r', '--list', '*pr/*').trim(), '')
    assert.equal(branchOf(worktree.path), 'HEAD', 'detached')
    assert.equal(
      readFileSync(join(worktree.path, '.env.local'), 'utf8'),
      'WT=1\n',
    )
    // A detached worktree has no branch to put in a command.
    assert.equal(
      readFileSync(join(worktree.path, 'made.txt'), 'utf8'),
      'setup 1 []\n',
    )
    assert.ok(worktree.log?.endsWith('.log'))
    assert.equal(
      worktree.message,
      `Made ${worktree.path} at #7's head, ${sha.slice(0, 7)}. Installing in the background`,
    )
    // No branch was cut for it.
    assert.equal(git(primary, 'branch', '--list', '*review*').trim(), '')
  })

  test("a fork's PR is never checked out: the worktree stands on the base, with the PR's head fetched beside it", async () => {
    const { primary, review } = fixture({
      setup: 'git rev-parse HEAD > ../setup-ran-at.txt',
    })
    const sha = pushPull(primary, 8, 'from a fork')
    const base = git(primary, 'rev-parse', 'origin/main').trim()
    const worktree = made(await review(8, { fork: true }))
    assert.equal(worktree.stands, 'base')
    assert.equal(worktree.head, sha)
    assert.equal(headOf(worktree.path), base)
    assert.equal(branchOf(worktree.path), 'HEAD')
    // The PR's commit is there to read, and nothing of its tree is on disk.
    assert.equal(git(primary, 'rev-parse', pullRef(8)).trim(), sha)
    assert.equal(
      git(worktree.path, 'diff', '--stat', 'HEAD').trim(),
      '',
      'the working tree is the base',
    )
    // Setup ran what the base holds, the repo's own.
    assert.equal(
      readFileSync(join(primary, '..', 'setup-ran-at.txt'), 'utf8').trim(),
      base,
    )
    assert.equal(
      worktree.message,
      `Made ${worktree.path} at origin/main, with #8's head ${sha.slice(0, 7)} fetched to read from there (a fork's PR isn't checked out)`,
    )

    // A later push moves only what is fetched; the worktree stays on the base.
    const later = pushPull(primary, 8, 'the fork pushed again')
    const again = made(await review(8, { fork: true }))
    assert.equal(again.head, later)
    assert.equal(headOf(again.path), base)
  })

  test("a second review moves the worktree to the PR's new head, a forced update included", async () => {
    const { primary, review } = fixture({ setup: 'echo ran >> ../setups.txt' })
    const first = pushPull(primary, 7, 'first push')
    const { path } = made(await review(7))
    assert.equal(headOf(path), first)
    // Not a descendant of the first: the author force-pushed.
    const second = pushPull(primary, 7, 'second push')
    const moved = made(await review(7))
    assert.equal(moved.path, path)
    assert.equal(moved.head, second)
    assert.equal(headOf(path), second)
    assert.equal(branchOf(path), 'HEAD')
    assert.equal(
      moved.message,
      `Put ${path} at #7's head, ${second.slice(0, 7)}`,
    )
    // A pruning fetch in between doesn't make the worktree look like it holds work of its own.
    git(primary, 'fetch', '-q', '--prune', 'origin')
    const third = pushPull(primary, 7, 'third push')
    assert.equal(made(await review(7)).head, third)
    // Setup ran when it was made, and not again.
    assert.equal(
      readFileSync(join(primary, '..', 'setups.txt'), 'utf8'),
      'ran\n',
    )
  })

  test('refuses to move one that has changed files, is on a branch, has a run going, or sits on a commit nothing else holds', async () => {
    const { primary, runs, review } = fixture()
    const first = pushPull(primary, 7, 'first push')
    const { path } = made(await review(7))
    pushPull(primary, 7, 'second push')
    const refusal = async () => {
      const result = await review(7)
      assert.ok('refused' in result, 'expected a refusal')
      return result.refused
    }

    writeFileSync(join(path, 'notes.txt'), 'mine\n')
    assert.match(await refusal(), /has 1 changed or untracked file\. /)
    rmSync(join(path, 'notes.txt'))

    git(path, 'switch', '-q', '-c', 'my-fix')
    assert.match(
      await refusal(),
      /is on my-fix now, so it isn't the review worktree any more/,
    )
    git(path, 'checkout', '-q', '--detach', first)
    git(primary, 'branch', '-q', '-D', 'my-fix')

    const dir = join(runs, '20261125T120000000-abcdef01')
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, META_FILE),
      JSON.stringify({
        id: '20261125T120000000-abcdef01',
        kind: 'task',
        title: 'Busy',
        root: primary,
        checkout: path,
        permissions: 'read',
        startedAt: new Date().toISOString(),
        steps: [
          {
            agent: 'claude',
            model: null,
            title: null,
            prompt: 'x',
            command: { program: 'claude', argv: [], env: {} },
          },
        ],
      }),
    )
    assert.match(await refusal(), /"Busy" is running in /)
    rmSync(dir, { recursive: true })

    // A commit made in the worktree, on no branch: moving would leave it to the reflog.
    git(path, 'commit', '-q', '--allow-empty', '-m', 'a fix of my own')
    const mine = headOf(path)
    assert.match(await refusal(), /is at a commit nothing else holds\. /)
    assert.equal(headOf(path), mine)
  })

  test("refuses a folder that isn't a worktree, a base branch git wouldn't take, and a PR the remote doesn't have", async () => {
    const { primary, review } = fixture()
    pushPull(primary, 7, 'the change')
    for (const base of ['-main', 'ma in', 'main..x', '']) {
      const result = await review(7, { base })
      assert.deepEqual(
        result,
        {
          refused: "#7's base branch isn't a name the monitor hands to git",
        },
        base,
      )
    }
    const missing = await review(99)
    assert.ok('refused' in missing)
    assert.match(missing.refused, /^Couldn't fetch #99 from origin: /)
    assert.equal(existsSync(reviewWorktreePath(primary, 99)), false)

    // The remote's PR #7 isn't the commit GitHub names: another repo's PR of the same number.
    const other = await review(7, { head: 'f'.repeat(40) })
    assert.ok('refused' in other)
    assert.match(
      other.refused,
      /^origin holds [0-9a-f]{7} for #7, and GitHub names fffffff as its head\. /,
    )
    assert.equal(existsSync(reviewWorktreePath(primary, 7)), false)

    mkdirSync(reviewWorktreePath(primary, 7))
    assert.deepEqual(await review(7), {
      refused: `${reviewWorktreePath(primary, 7)} already exists and isn't a worktree of ${primary}`,
    })
  })

  test('it reads as detached on the checkouts read, and removeWorktree removes it', async () => {
    const { primary, tracking, runs, review } = fixture()
    const sha = pushPull(primary, 7, 'the change')
    const { path } = made(await review(7))
    const read = await readCheckouts(tracking)
    assert.ok(!('problem' in read))
    const checkout = read.repos[0].checkouts.find((each) => each.path === path)
    assert.ok(checkout, 'the review worktree is listed')
    assert.equal(checkout.branch, null)
    assert.equal(checkout.head, sha.slice(0, 7))
    assert.equal(checkout.ahead, 1)

    // A commit made in it is on no branch: removing the worktree would leave it to the reflog.
    git(path, 'commit', '-q', '--allow-empty', '-m', 'a fix of my own')
    const mine = headOf(path)
    const remove = () =>
      removeWorktree(
        tracking,
        { root: primary, path, deleteBranch: true },
        { runs },
      )
    const kept = await remove()
    assert.equal(kept.ok, false)
    assert.match(
      kept.message,
      /is on no branch, at a commit nothing else holds\. Put it on a branch/,
    )
    assert.ok(existsSync(path))
    // Once a branch holds the commit, the worktree goes and the commit stays.
    git(primary, 'branch', 'my-fix', mine)
    const removed = await remove()
    assert.equal(removed.ok, true, removed.message)
    assert.equal(removed.message, `Removed ${path}`)
    assert.equal(existsSync(path), false)
    assert.equal(git(primary, 'rev-parse', 'my-fix').trim(), mine)
  })

  test('a setup that fails takes the detached worktree back, with no branch to delete', async () => {
    const { primary, review } = fixture({ setup: 'echo nope >&2; exit 3' })
    pushPull(primary, 7, 'the change')
    const result = await review(7)
    assert.ok('refused' in result)
    assert.match(
      result.refused,
      /^Setup failed, so the worktree was taken back: nope/,
    )
    assert.equal(existsSync(reviewWorktreePath(primary, 7)), false)
  })
})
