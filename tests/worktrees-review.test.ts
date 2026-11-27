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
  const { primary } = cloneWithOrigin(root)
  writeJson(join(primary, 'stack-monitor.json'), { worktrees })
  process.env[INSTALLS_ENV] = join(root, 'installs')
  const tracking: Tracking = {
    settings: join(root, 'settings.json'),
    seed: primary,
  }
  const runs = join(root, 'runs')
  const review = (
    number: number,
    target: { base?: string; fork?: boolean } = {},
  ) =>
    makeReviewWorktree(
      tracking,
      primary,
      { number, base: 'main', fork: false, ...target },
      { runs },
    )
  return { root, primary, tracking, runs, review }
}

function made(result: ReviewWorktree | { refused: string }): ReviewWorktree {
  assert.ok(!('refused' in result), 'refused' in result ? result.refused : '')
  return result
}

const headOf = (path: string) => git(path, 'rev-parse', 'HEAD').trim()
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
    assert.equal(headOf(worktree.path), sha)
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

  test("a fork's PR gets its index and neither setup nor install", async () => {
    const { primary, review } = fixture({
      index: { file: '.env.local', key: 'WT' },
      setup: 'touch setup-ran',
      install: 'touch install-ran',
    })
    pushPull(primary, 8, 'from a fork')
    const worktree = made(await review(8, { fork: true }))
    assert.equal(
      readFileSync(join(worktree.path, '.env.local'), 'utf8'),
      'WT=1\n',
    )
    assert.equal(existsSync(join(worktree.path, 'setup-ran')), false)
    assert.equal(worktree.log, null)
    assert.match(
      worktree.message,
      /It's a fork's PR, so the repo's setup and install weren't run$/,
    )
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
      `Moved ${path} to #7's head, ${second.slice(0, 7)}`,
    )
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
      // Nothing moved.
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

    const removed = await removeWorktree(
      tracking,
      { root: primary, path, deleteBranch: true },
      { runs },
    )
    assert.equal(removed.ok, true, removed.message)
    assert.equal(removed.message, `Removed ${path}`)
    assert.equal(existsSync(path), false)
  })
})
