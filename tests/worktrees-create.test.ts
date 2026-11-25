import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, test } from 'node:test'

import type { Tracking } from '../core/settings.ts'
import {
  BranchName,
  createWorktree,
  INSTALLS_ENV,
  worktreePath,
} from '../core/worktrees/create.ts'
import { cloneWithOrigin, git, tempDir, writeJson } from './fixtures.ts'

delete process.env.STACK_MONITOR_CONFIG

function fixture(worktrees: Record<string, unknown> = {}) {
  const root = tempDir()
  const clone = cloneWithOrigin(root)
  writeJson(join(clone.primary, 'stack-monitor.json'), { worktrees })
  process.env[INSTALLS_ENV] = join(root, 'installs')
  const tracking: Tracking = {
    settings: join(root, 'settings.json'),
    seed: clone.primary,
  }
  return { root, primary: clone.primary, tracking }
}

const branchOf = (path: string) =>
  git(path, 'rev-parse', '--abbrev-ref', 'HEAD').trim()

describe('making a worktree', () => {
  test('without a create command: git worktree add beside the primary, an index, setup, then install', async () => {
    const { primary, tracking } = fixture({
      index: { file: '.env.local', key: 'WT' },
      setup: 'echo "setup {index} {branch}" > made.txt',
      install: 'echo installed',
    })
    const made = await createWorktree(tracking, {
      root: primary,
      branch: 'feature/login',
    })
    assert.equal(made.ok, true, made.message)
    const path = worktreePath(primary, 'feature/login')
    assert.match(path, /app-feature-login$/)
    assert.equal(branchOf(path), 'feature/login')
    // The fixture's linked worktrees keep no index, so 1 is the lowest free.
    assert.equal(readFileSync(join(path, '.env.local'), 'utf8'), 'WT=1\n')
    assert.equal(
      readFileSync(join(path, 'made.txt'), 'utf8'),
      'setup 1 feature/login\n',
    )
    assert.ok(made.log?.endsWith('.log'))
  })

  test('the next one takes the next free index', async () => {
    const { primary, tracking } = fixture({
      index: { file: '.env.local', key: 'WT' },
    })
    await createWorktree(tracking, { root: primary, branch: 'one' })
    const second = await createWorktree(tracking, {
      root: primary,
      branch: 'two',
    })
    assert.equal(second.ok, true, second.message)
    const path = worktreePath(primary, 'two')
    assert.equal(readFileSync(join(path, '.env.local'), 'utf8'), 'WT=2\n')
  })

  test('a failed setup takes the worktree and its branch back', async () => {
    const { primary, tracking } = fixture({ setup: 'echo nope >&2; exit 3' })
    const made = await createWorktree(tracking, {
      root: primary,
      branch: 'broken',
    })
    assert.equal(made.ok, false)
    assert.match(made.message, /^Setup failed.*nope/s)
    assert.equal(existsSync(worktreePath(primary, 'broken')), false)
    assert.equal(git(primary, 'branch', '--list', 'broken').trim(), '')
  })

  test("runs the repo's own create command in the primary, with the branch put in", async () => {
    const { root, primary, tracking } = fixture({
      create: 'git worktree add -q -b {branch} ../made-{branch}',
    })
    const made = await createWorktree(tracking, { root: primary, branch: 'x' })
    assert.equal(made.ok, true, made.message)
    assert.equal(branchOf(join(root, 'made-x')), 'x')
  })

  test('says why a create command failed', async () => {
    const { primary, tracking } = fixture({
      create: 'echo "no {branch} for you" >&2; exit 1',
    })
    const made = await createWorktree(tracking, { root: primary, branch: 'y' })
    assert.equal(made.ok, false)
    assert.match(made.message, /no y for you/)
  })

  test('refuses a branch that exists, a repo not in the list and a name a shell would read', async () => {
    const { root, primary, tracking } = fixture()
    const existing = await createWorktree(tracking, {
      root: primary,
      branch: 'ahead',
    })
    assert.equal(existing.message, 'ahead is already a branch')
    const stranger = await createWorktree(tracking, {
      root: join(root, 'elsewhere'),
      branch: 'z',
    })
    assert.equal(stranger.ok, false)
    for (const bad of ['-x', 'a;rm', '$(x)', 'a b', '']) {
      assert.equal(BranchName.safeParse(bad).success, false, bad)
    }
    const dots = await createWorktree(tracking, {
      root: primary,
      branch: 'a..b',
    })
    assert.match(dots.message, /isn't a branch name git takes/)
  })
})
