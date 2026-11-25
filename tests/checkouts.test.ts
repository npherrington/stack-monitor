import assert from 'node:assert/strict'
import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, test } from 'node:test'

import { addRepo } from '../core/repos.ts'
import type { Tracking } from '../core/settings.ts'
import type { Checkout, RepoCheckouts } from '../core/types.ts'
import { parseStatus, readCheckouts } from '../core/worktrees/checkouts.ts'
import {
  cloneWithOrigin,
  git,
  gitRepo,
  tempDir,
  writeJson,
} from './fixtures.ts'

// Whatever the shell running the tests names would be read instead of the fixtures' configs.
delete process.env.STACK_MONITOR_CONFIG

describe('parsing git status', () => {
  test('reads the branch, the head and a count of changed paths', () => {
    const porcelain = [
      '# branch.oid 0123456789abcdef',
      '# branch.head feature/x',
      '# branch.upstream origin/feature/x',
      '# branch.ab +1 -0',
      '1 .M N... 100644 100644 100644 aaa bbb README',
      '2 R. N... 100644 100644 100644 aaa bbb R100 new\told',
      'u UU N... 100644 100644 100644 100644 a b c conflicted',
      '? untracked.txt',
      '',
    ].join('\n')
    assert.deepEqual(parseStatus(porcelain), {
      branch: 'feature/x',
      oid: '0123456789abcdef',
      changed: 4,
    })
  })

  test('a detached head has no branch', () => {
    assert.deepEqual(
      parseStatus('# branch.oid abc\n# branch.head (detached)\n'),
      { branch: null, oid: 'abc', changed: 0 },
    )
  })

  test('a clean tree has nothing changed, and an empty one nothing at all', () => {
    assert.equal(
      parseStatus('# branch.oid abc\n# branch.head main\n').changed,
      0,
    )
    assert.deepEqual(parseStatus(''), { branch: null, oid: '', changed: 0 })
  })
})

describe('reading the checkouts', () => {
  async function readFresh() {
    const root = tempDir()
    const clone = cloneWithOrigin(root)
    const detached = join(root, 'app-detached')
    git(clone.primary, 'worktree', 'add', '-q', '--detach', detached, 'HEAD~1')
    const pruned = join(root, 'app-pruned')
    git(clone.primary, 'worktree', 'add', '-q', '-b', 'pruned', pruned)
    rmSync(pruned, { recursive: true })
    const tracking: Tracking = {
      settings: join(root, 'settings.json'),
      seed: clone.primary,
    }
    const read = await readCheckouts(tracking)
    assert.ok(!('problem' in read))
    const [repo] = read.repos
    const at = (path: string): Checkout => {
      const found = repo.checkouts.find((checkout) => checkout.path === path)
      assert.ok(found, `no checkout at ${path}`)
      return found
    }
    return { root, clone, detached, pruned, tracking, repo, at }
  }
  // One fixture for the tests that only read it.
  let shared: ReturnType<typeof readFresh> | undefined
  const snapshot = () => (shared ??= readFresh())

  test('lists every worktree, the primary first, against origin/main', async () => {
    const { clone, repo, detached, pruned } = await snapshot()
    assert.equal(repo.mainline, 'origin/main')
    assert.equal(repo.problem, null)
    assert.equal(repo.name, 'app')
    assert.deepEqual(
      repo.checkouts.map((checkout) => [checkout.path, checkout.primary]),
      [
        [clone.primary, true],
        [clone.ahead, false],
        [clone.behind, false],
        [clone.changed, false],
        [detached, false],
        [clone.merged, false],
        [pruned, false],
      ],
    )
  })

  test('tells ahead, behind, changed and merged apart', async () => {
    const { clone, at } = await snapshot()
    const state = ({ branch, changed, ahead, behind, merged }: Checkout) => ({
      branch,
      changed,
      ahead,
      behind,
      merged,
    })
    assert.deepEqual(state(at(clone.primary)), {
      branch: 'main',
      changed: 0,
      ahead: 0,
      behind: 0,
      merged: false,
    })
    assert.deepEqual(state(at(clone.ahead)), {
      branch: 'ahead',
      changed: 0,
      ahead: 1,
      behind: 0,
      merged: false,
    })
    assert.deepEqual(state(at(clone.behind)), {
      branch: 'behind',
      changed: 0,
      ahead: 0,
      behind: 2,
      merged: false,
    })
    assert.deepEqual(state(at(clone.changed)), {
      branch: 'changed',
      changed: 2,
      ahead: 0,
      behind: 0,
      merged: false,
    })
    assert.deepEqual(state(at(clone.merged)), {
      branch: 'merged',
      changed: 0,
      ahead: 0,
      behind: 1,
      merged: true,
    })
    assert.match(at(clone.ahead).head, /^[0-9a-f]{7}$/)
    assert.equal(at(clone.ahead).problem, null)
  })

  test('a detached head reads with no branch and is never merged', async () => {
    const { detached, at } = await snapshot()
    const checkout = at(detached)
    assert.equal(checkout.branch, null)
    assert.equal(checkout.merged, false)
    assert.equal(checkout.problem, null)
  })

  test('a prunable worktree still appears, with a problem and no counts', async () => {
    const { pruned, at } = await snapshot()
    assert.deepEqual(at(pruned), {
      path: pruned,
      primary: false,
      branch: null,
      head: '',
      changed: 0,
      ahead: null,
      behind: null,
      merged: false,
      locked: false,
      prunable: true,
      problem: 'Its directory is gone',
      services: [],
    })
  })

  test("follows the repo's own mainline, and a mainline that doesn't resolve leaves no counts", async () => {
    const root = tempDir()
    const clone = cloneWithOrigin(root)
    writeJson(join(clone.primary, 'stack-monitor.json'), {
      mainline: 'origin/trunk',
    })
    const read = await readCheckouts({
      settings: join(root, 'settings.json'),
      seed: clone.primary,
    })
    assert.ok(!('problem' in read))
    const [repo] = read.repos
    assert.equal(repo.mainline, 'origin/trunk')
    const ahead = repo.checkouts.find((c) => c.path === clone.ahead)
    assert.equal(ahead?.ahead, null)
    assert.equal(ahead?.behind, null)
    assert.equal(ahead?.merged, false)
    assert.equal(ahead?.problem, null)
  })

  test("a repo that can't be read appears with a problem and no checkouts", async () => {
    const { root, clone, tracking } = await readFresh()
    // A checkout whose git state can't be read still appears, with why.
    writeFileSync(join(clone.changed, '.git'), 'gitdir: /nowhere\n')
    const gone = gitRepo(join(root, 'gone'))
    await addRepo(tracking, { path: gone })
    rmSync(gone, { recursive: true })
    const read = await readCheckouts(tracking)
    assert.ok(!('problem' in read))
    const goneRepo: RepoCheckouts = read.repos[1]
    assert.deepEqual(goneRepo, {
      root: gone,
      name: 'gone',
      mainline: 'origin/main',
      services: [],
      checkouts: [],
      problem: `${gone} doesn't exist any more`,
    })
    const broken = read.repos[0].checkouts.find((c) => c.path === clone.changed)
    assert.equal(broken?.changed, 0)
    assert.equal(broken?.prunable, false)
    // git's own words differ between versions, so only the monitor's prefix is checked.
    assert.match(broken?.problem ?? '', /^git status failed: \S/)
    assert.equal(read.repos[0].checkouts.length, 7)
  })
})
