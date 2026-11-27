import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, test } from 'node:test'

import {
  findRepo,
  parseWorktreeList,
  primaryRoot,
} from '../core/worktrees/clone.ts'
import { git, gitRepo, tempDir } from './fixtures.ts'

// A primary checkout with one linked worktree beside it.
function clone() {
  const root = tempDir()
  const primary = gitRepo(join(root, 'app'))
  const linked = join(root, 'app-wt1')
  git(primary, 'worktree', 'add', '-q', '-b', 'feature', linked)
  return { root, primary, linked }
}

describe('the clone', () => {
  test('a directory inside a checkout stands for that checkout', async () => {
    const { linked } = clone()
    const inside = join(linked, 'src', 'deep')
    mkdirSync(inside, { recursive: true })
    assert.deepEqual(await findRepo(inside), { root: linked })
  })

  test('a directory outside any checkout is refused', async () => {
    const dir = tempDir()
    assert.deepEqual(await findRepo(dir), {
      error: `${dir} isn't inside a git checkout`,
    })
  })

  test('the primary is the checkout that is not linked, from either', async () => {
    const { primary, linked } = clone()
    assert.equal(await primaryRoot(linked), primary)
    assert.equal(await primaryRoot(primary), primary)
  })

  test('reads each worktree’s branch, and locked and prunable ones, from the porcelain list', () => {
    const porcelain = [
      'worktree /src/app\nHEAD abc\nbranch refs/heads/main',
      'worktree /src/app-wt1\nHEAD def\ndetached\nlocked in use',
      'worktree /src/gone\nHEAD 123\nbranch refs/heads/x\nprunable gitdir file points to non-existent location',
      '',
    ].join('\n\n')
    assert.deepEqual(parseWorktreeList(porcelain), [
      { path: '/src/app', branch: 'main', locked: false, prunable: false },
      { path: '/src/app-wt1', branch: null, locked: true, prunable: false },
      { path: '/src/gone', branch: 'x', locked: false, prunable: true },
    ])
  })
})
