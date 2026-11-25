import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, test } from 'node:test'

import { META_FILE } from '../core/agents/run-files.ts'
import type { Tracking } from '../core/settings.ts'
import {
  createWorktree,
  INSTALLS_ENV,
  worktreePath,
} from '../core/worktrees/create.ts'
import { removeWorktree } from '../core/worktrees/remove.ts'
import { cloneWithOrigin, git, tempDir, writeJson } from './fixtures.ts'

delete process.env.STACK_MONITOR_CONFIG

async function fixture(worktrees: Record<string, unknown> = {}) {
  const root = tempDir()
  const clone = cloneWithOrigin(root)
  writeJson(join(clone.primary, 'stack-monitor.json'), { worktrees })
  process.env[INSTALLS_ENV] = join(root, 'installs')
  const tracking: Tracking = {
    settings: join(root, 'settings.json'),
    seed: clone.primary,
  }
  const runs = join(root, 'runs')
  const made = await createWorktree(tracking, {
    root: clone.primary,
    branch: 'feature/x',
  })
  assert.equal(made.ok, true, made.message)
  const path = worktreePath(clone.primary, 'feature/x')
  return { root, primary: clone.primary, tracking, runs, path }
}

const branches = (primary: string) =>
  git(primary, 'branch', '--format=%(refname:short)').trim().split('\n')

describe('removing a worktree', () => {
  test('a clean one goes, and with deleteBranch its merged branch too', async () => {
    const { primary, tracking, runs, path } = await fixture()
    const removed = await removeWorktree(
      tracking,
      { root: primary, path, deleteBranch: true },
      { runs },
    )
    assert.equal(removed.ok, true, removed.message)
    assert.equal(existsSync(path), false)
    assert.equal(branches(primary).includes('feature/x'), false)
  })

  test('an unmerged branch is kept, the worktree still removed', async () => {
    const { primary, tracking, runs, path } = await fixture()
    writeFileSync(join(path, 'new.txt'), 'work\n')
    git(path, 'add', 'new.txt')
    git(path, 'commit', '-q', '-m', 'work')
    const removed = await removeWorktree(
      tracking,
      { root: primary, path, deleteBranch: true },
      { runs },
    )
    assert.equal(removed.ok, true, removed.message)
    assert.match(removed.message, /kept feature\/x/)
    assert.equal(existsSync(path), false)
    assert.ok(branches(primary).includes('feature/x'))
  })

  test('refuses changed files, the primary, and a path that is not a worktree', async () => {
    const { primary, tracking, runs, path } = await fixture()
    writeFileSync(join(path, 'loose.txt'), 'untracked\n')
    const dirty = await removeWorktree(
      tracking,
      { root: primary, path, deleteBranch: false },
      { runs },
    )
    assert.match(dirty.message, /1 changed or untracked file/)
    assert.ok(existsSync(join(path, 'loose.txt')))
    const main = await removeWorktree(
      tracking,
      { root: primary, path: primary, deleteBranch: false },
      { runs },
    )
    assert.match(main.message, /primary checkout/)
    const stray = await removeWorktree(
      tracking,
      { root: primary, path: tempDir(), deleteBranch: false },
      { runs },
    )
    assert.match(stray.message, /isn't a worktree of/)
  })

  test('refuses while a run is going there', async () => {
    const { primary, tracking, runs, path } = await fixture()
    // A run just started: meta.json and no pid yet, which counts as running.
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
        permissions: 'edit',
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
    const busy = await removeWorktree(
      tracking,
      { root: primary, path, deleteBranch: false },
      { runs },
    )
    assert.match(busy.message, /"Busy" is running/)
    assert.ok(existsSync(path))
  })

  test('teardown runs first with the branch filled in; a failed one removes nothing', async () => {
    const { primary, tracking, runs, path } = await fixture({
      teardown: 'echo "down {branch}" >> "$HOME_LOG"; test ! -f stop',
    })
    const log = join(tempDir(), 'teardown.log')
    process.env.HOME_LOG = log
    writeFileSync(join(path, 'stop'), '')
    git(path, 'add', 'stop')
    git(path, 'commit', '-q', '-m', 'stop')
    const failed = await removeWorktree(
      tracking,
      { root: primary, path, deleteBranch: false },
      { runs },
    )
    assert.match(failed.message, /Teardown failed, so nothing was removed/)
    assert.ok(existsSync(path))
    git(path, 'rm', '-q', 'stop')
    git(path, 'commit', '-q', '-m', 'go')
    const removed = await removeWorktree(
      tracking,
      { root: primary, path, deleteBranch: false },
      { runs },
    )
    assert.equal(removed.ok, true, removed.message)
    assert.equal(readFileSync(log, 'utf8'), 'down feature/x\ndown feature/x\n')
    delete process.env.HOME_LOG
  })
})
