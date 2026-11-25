import assert from 'node:assert/strict'
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, test } from 'node:test'

import { scanFolder } from '../core/scan.ts'
import type { ScanResult } from '../core/types.ts'
import { git, gitRepo, tempDir } from './fixtures.ts'

// A folder of repos at each depth, in each place the scan skips, and linked worktrees whose
// primaries are inside it and outside it.
function tree() {
  const root = tempDir()
  const folder = join(root, 'src')
  const one = gitRepo(join(folder, 'one'))
  gitRepo(join(one, 'packages', 'inner')) // inside a repo: not descended into
  const two = gitRepo(join(folder, 'group', 'two'))
  const three = gitRepo(join(folder, 'a', 'b', 'three')) // 3 deep: found
  gitRepo(join(folder, 'a', 'b', 'c', 'four')) // 4 deep: not
  gitRepo(join(folder, 'node_modules', 'pkg'))
  gitRepo(join(folder, '.hidden', 'repo'))
  gitRepo(join(folder, 'Library', 'repo'))
  git(one, 'worktree', 'add', '-q', '-b', 'wt', join(folder, 'one-wt1'))
  const outside = gitRepo(join(root, 'outside'))
  git(outside, 'worktree', 'add', '-q', '-b', 'wt', join(folder, 'out-wt1'))
  git(outside, 'worktree', 'add', '-q', '-b', 'wt2', join(root, 'out-wt2'))
  return { root, folder, one, two, three, outside }
}

function hitsOf(result: ScanResult | { error: string }) {
  assert.ok(!('error' in result), 'error' in result ? result.error : '')
  return result
}

describe('scanning a folder for repos', () => {
  test('finds repos to 3 deep, skipping what it should, a worktree counted under its repo', async () => {
    const { folder, one, two, three, outside } = tree()
    const result = hitsOf(await scanFolder(folder, new Set([two])))
    assert.equal(result.folder, folder)
    assert.equal(result.truncated, false)
    assert.deepEqual(
      result.hits,
      [
        { root: one, name: 'one', worktrees: 2, tracked: false },
        { root: two, name: 'two', worktrees: 1, tracked: true },
        { root: three, name: 'three', worktrees: 1, tracked: false },
        { root: outside, name: 'outside', worktrees: 3, tracked: false },
      ].toSorted((a, b) => a.root.localeCompare(b.root)),
    )
  })

  test('a folder that is itself a repo is the one hit', async () => {
    const { one } = tree()
    assert.deepEqual(hitsOf(await scanFolder(one, new Set())).hits, [
      { root: one, name: 'one', worktrees: 2, tracked: false },
    ])
  })

  test('skips a folder it cannot read', async () => {
    const { folder } = tree()
    const shut = join(folder, 'shut')
    gitRepo(join(shut, 'hidden-repo'))
    chmodSync(shut, 0o000)
    try {
      const result = hitsOf(await scanFolder(folder, new Set()))
      assert.equal(result.hits.length, 4)
      assert.equal(result.truncated, false)
    } finally {
      // Or the temp dir's cleanup can't empty it.
      chmodSync(shut, 0o755)
    }
  })

  test('says it was cut short at the hit cap or the time limit', async () => {
    const { folder } = tree()
    const capped = hitsOf(
      await scanFolder(folder, new Set(), { maxHits: 2, timeMs: 3000 }),
    )
    assert.equal(capped.truncated, true)
    assert.ok(capped.hits.length <= 2)
    const timed = hitsOf(
      await scanFolder(folder, new Set(), { maxHits: 200, timeMs: -1 }),
    )
    assert.deepEqual(timed.hits, [])
    assert.equal(timed.truncated, true)
  })

  test('refuses a folder that does not exist or is a file', async () => {
    const root = tempDir()
    const missing = join(root, 'nope')
    assert.deepEqual(await scanFolder(missing, new Set()), {
      error: `${missing} doesn't exist`,
    })
    const file = join(root, 'file')
    writeFileSync(file, '')
    assert.deepEqual(await scanFolder(file, new Set()), {
      error: `${file} isn't a folder`,
    })
    mkdirSync(join(root, 'empty'))
    assert.deepEqual(await scanFolder(join(root, 'empty'), new Set()), {
      folder: join(root, 'empty'),
      hits: [],
      truncated: false,
    })
  })
})
