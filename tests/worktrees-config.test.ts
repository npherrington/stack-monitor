import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, test } from 'node:test'

import { personalConfigPath, type Tracking } from '../core/settings.ts'
import {
  readRepoWorktrees,
  saveRepoWorktrees,
} from '../core/worktrees/config.ts'
import { gitRepo, tempDir, writeJson } from './fixtures.ts'

// Whatever the shell running the tests names would be read instead of the fixtures' configs.
delete process.env.STACK_MONITOR_CONFIG

const WEB = { start: 'npm run dev', status: { process: { match: 'vite' } } }

function places() {
  const root = tempDir()
  const seed = gitRepo(join(root, 'app'))
  const tracking: Tracking = { settings: join(root, 'conf', 's.json'), seed }
  const personal = personalConfigPath(tracking.settings, seed)
  const repoFile = join(seed, 'stack-monitor.json')
  const written = () => JSON.parse(readFileSync(personal, 'utf8'))
  return { root, seed, tracking, personal, repoFile, written }
}

describe('reading the worktree settings in effect', () => {
  test('without a config, they are empty, and Save writes the personal file', () => {
    const { seed, tracking, personal } = places()
    assert.deepEqual(readRepoWorktrees(tracking, seed), {
      root: seed,
      worktrees: {},
      source: null,
      personal,
      editable: true,
    })
  })

  test("the repo's file gives them as written, defaults not filled in", () => {
    const { seed, tracking, repoFile } = places()
    const worktrees = {
      create: 'scripts/worktree.sh {branch}',
      index: { file: '.env', key: 'INDEX' },
    }
    writeJson(repoFile, { worktrees })
    assert.deepEqual(readRepoWorktrees(tracking, seed), {
      root: seed,
      worktrees,
      source: repoFile,
      personal: personalConfigPath(tracking.settings, seed),
      editable: false,
    })
  })

  test('refuses a root not in the list', () => {
    const { root, tracking } = places()
    const other = join(root, 'other')
    assert.deepEqual(readRepoWorktrees(tracking, other), {
      refused: `${other} isn't in the list`,
    })
  })
})

describe('saving the worktree settings', () => {
  test("the first save copies the repo file's other sections", async () => {
    const { seed, tracking, personal, repoFile, written } = places()
    writeJson(repoFile, {
      $schema: './schema/stack-monitor.schema.json',
      mainline: 'origin/trunk',
      worktrees: { install: 'npm ci' },
      stack: { services: { web: WEB } },
    })
    assert.deepEqual(
      await saveRepoWorktrees(tracking, {
        root: seed,
        worktrees: { create: 'mise run worktree -- {branch}' },
      }),
      {
        ok: true,
        message: `Saved the worktree settings to ${personal}, with the rest of ${repoFile}`,
        log: null,
      },
    )
    assert.deepEqual(written(), {
      mainline: 'origin/trunk',
      stack: { services: { web: WEB } },
      worktrees: { create: 'mise run worktree -- {branch}' },
    })
    const read = readRepoWorktrees(tracking, seed)
    assert.ok('root' in read)
    assert.equal(read.source, personal)
    assert.equal(read.editable, true)
  })

  test('an empty object removes the section and keeps the rest', async () => {
    const { seed, tracking, personal, written } = places()
    mkdirSync(dirname(personal), { recursive: true })
    writeJson(personal, {
      mainline: 'origin/mine',
      worktrees: { setup: 'cp .env.example .env' },
    })
    assert.deepEqual(
      await saveRepoWorktrees(tracking, { root: seed, worktrees: {} }),
      {
        ok: true,
        message: `Removed the worktree settings from ${personal}`,
        log: null,
      },
    )
    assert.deepEqual(written(), { mainline: 'origin/mine' })
    const read = readRepoWorktrees(tracking, seed)
    assert.ok('root' in read)
    assert.deepEqual(read.worktrees, {})
  })

  test('create must say where the branch goes', async () => {
    const { seed, tracking, personal } = places()
    assert.deepEqual(
      await saveRepoWorktrees(tracking, {
        root: seed,
        worktrees: { create: 'scripts/worktree.sh' },
      }),
      {
        invalid:
          'worktrees.create: must say where the branch goes with {branch}',
      },
    )
    assert.equal(existsSync(personal), false)
  })

  test('{index} in setup needs worktrees.index, and passes with it', async () => {
    const { seed, tracking, personal, written } = places()
    assert.deepEqual(
      await saveRepoWorktrees(tracking, {
        root: seed,
        worktrees: { setup: 'echo INDEX={index} > .env' },
      }),
      { invalid: 'worktrees.setup: uses {index}, which needs worktrees.index' },
    )
    assert.equal(existsSync(personal), false)
    const worktrees = {
      setup: 'echo INDEX={index} > .env',
      index: { file: '.env', key: 'INDEX' },
    }
    const saved = await saveRepoWorktrees(tracking, { root: seed, worktrees })
    assert.ok('ok' in saved && saved.ok)
    assert.deepEqual(written(), { worktrees })
  })

  test("removing index is refused while the stack's commands use {index}", async () => {
    const { seed, tracking, personal } = places()
    mkdirSync(dirname(personal), { recursive: true })
    writeJson(personal, {
      worktrees: { index: { file: '.env', key: 'INDEX' } },
      stack: { services: { db: { ...WEB, start: 'up {index}' } } },
    })
    assert.deepEqual(
      await saveRepoWorktrees(tracking, { root: seed, worktrees: {} }),
      {
        invalid:
          'stack.services.db.start: uses {index}, which needs worktrees.index',
      },
    )
  })

  test('refuses a root not in the list', async () => {
    const { root, tracking } = places()
    const other = join(root, 'other')
    assert.deepEqual(
      await saveRepoWorktrees(tracking, { root: other, worktrees: {} }),
      { ok: false, message: `${other} isn't in the list`, log: null },
    )
  })
})
