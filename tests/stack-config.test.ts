import assert from 'node:assert/strict'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, test } from 'node:test'

import { readRepoStatuses } from '../core/repos.ts'
import { personalConfigPath, type Tracking } from '../core/settings.ts'
import { readRepoStack, saveRepoStack } from '../core/stack/config.ts'
import { gitRepo, tempDir, writeJson } from './fixtures.ts'

// Whatever the shell running the tests names would be read instead of the fixtures' configs.
delete process.env.STACK_MONITOR_CONFIG

const WEB = { start: 'npm run dev', status: { process: { match: 'vite' } } }

// A seed repo and a settings file in a temp dir, so the personal file lands there too.
function places() {
  const root = tempDir()
  const seed = gitRepo(join(root, 'app'))
  const tracking: Tracking = { settings: join(root, 'conf', 's.json'), seed }
  const personal = personalConfigPath(tracking.settings, seed)
  const repoFile = join(seed, 'stack-monitor.json')
  const written = () => JSON.parse(readFileSync(personal, 'utf8'))
  return { root, seed, tracking, personal, repoFile, written }
}

describe('reading the stack in effect', () => {
  test('without a config, there is no stack, and Save writes the personal file', () => {
    const { seed, tracking, personal } = places()
    assert.deepEqual(readRepoStack(tracking, seed), {
      root: seed,
      stack: null,
      source: null,
      personal,
      editable: true,
    })
  })

  test("the repo's file gives the stack as written, not editable here", () => {
    const { seed, tracking, repoFile } = places()
    writeJson(repoFile, { stack: { services: { web: WEB } } })
    const read = readRepoStack(tracking, seed)
    assert.ok('root' in read)
    // As written: no defaults filled in, so the editor round-trips it.
    assert.deepEqual(read.stack, { services: { web: WEB } })
    assert.equal(read.source, repoFile)
    assert.equal(read.editable, false)
  })

  test('refuses a root not in the list', () => {
    const { root, tracking } = places()
    const other = join(root, 'other')
    assert.deepEqual(readRepoStack(tracking, other), {
      refused: `${other} isn't in the list`,
    })
  })
})

describe('saving the stack', () => {
  test("the first save copies the repo file's other sections, and the personal file then wins", async () => {
    const { seed, tracking, personal, repoFile, written } = places()
    writeJson(repoFile, {
      $schema: './schema/stack-monitor.schema.json',
      mainline: 'origin/trunk',
      worktrees: { install: 'npm ci' },
      stack: { services: { old: WEB } },
    })
    assert.deepEqual(
      await saveRepoStack(tracking, {
        root: seed,
        stack: { services: { web: WEB } },
      }),
      {
        ok: true,
        message: `Saved the stack to ${personal}, with the rest of ${repoFile}`,
        log: null,
      },
    )
    assert.deepEqual(written(), {
      mainline: 'origin/trunk',
      worktrees: { install: 'npm ci' },
      stack: { services: { web: WEB } },
    })
    const read = readRepoStack(tracking, seed)
    assert.ok('root' in read)
    assert.equal(read.source, personal)
    assert.equal(read.editable, true)
    const statuses = await readRepoStatuses(tracking)
    assert.ok('repos' in statuses)
    assert.equal(statuses.repos[0].config?.source, personal)
  })

  test("a later save keeps the personal file's other sections, not the repo's", async () => {
    const { seed, tracking, personal, repoFile, written } = places()
    writeJson(repoFile, { mainline: 'origin/trunk' })
    mkdirSync(dirname(personal), { recursive: true })
    writeJson(personal, { mainline: 'origin/mine' })
    const saved = await saveRepoStack(tracking, {
      root: seed,
      stack: { services: { web: WEB } },
    })
    assert.ok('ok' in saved && saved.ok)
    assert.equal(saved.message, `Saved the stack to ${personal}`)
    assert.deepEqual(written(), {
      mainline: 'origin/mine',
      stack: { services: { web: WEB } },
    })
  })

  test('null removes the section and keeps the rest', async () => {
    const { seed, tracking, personal, written } = places()
    mkdirSync(dirname(personal), { recursive: true })
    writeJson(personal, {
      mainline: 'origin/mine',
      stack: { services: { web: WEB } },
    })
    const saved = await saveRepoStack(tracking, { root: seed, stack: null })
    assert.deepEqual(saved, {
      ok: true,
      message: `Removed the stack from ${personal}`,
      log: null,
    })
    assert.deepEqual(written(), { mainline: 'origin/mine' })
  })

  test('checks the whole config it would make, and writes nothing when it fails', async () => {
    const { seed, tracking, personal } = places()
    const loop = await saveRepoStack(tracking, {
      root: seed,
      stack: {
        services: {
          a: { ...WEB, needs: ['b'] },
          b: { ...WEB, needs: ['a'] },
        },
      },
    })
    assert.deepEqual(loop, {
      invalid: 'stack.services: needs go round in a loop: a → b → a',
    })
    // {index} needs worktrees.index, which is outside the stack.
    const index = await saveRepoStack(tracking, {
      root: seed,
      stack: { services: { db: { ...WEB, start: 'up {index}' } } },
    })
    assert.deepEqual(index, {
      invalid:
        'stack.services.db.start: uses {index}, which needs worktrees.index',
    })
    assert.equal(existsSync(personal), false)
  })

  test('writes through a temp file and a rename, leaving none behind', async () => {
    const { seed, tracking, personal } = places()
    await saveRepoStack(tracking, {
      root: seed,
      stack: { services: { web: WEB } },
    })
    assert.deepEqual(readdirSync(dirname(personal)), [
      personal.slice(dirname(personal).length + 1),
    ])
    // A folder it can't write in: the save fails, saying so, and leaves nothing.
    const { tracking: blocked, personal: blockedPath } = places()
    const folder = dirname(blockedPath)
    mkdirSync(folder, { recursive: true })
    chmodSync(folder, 0o555)
    try {
      const failed = await saveRepoStack(blocked, {
        root: blocked.seed,
        stack: { services: { web: WEB } },
      })
      assert.ok('ok' in failed && !failed.ok)
      assert.match(failed.message, /^Couldn't write .*EACCES/)
      assert.deepEqual(readdirSync(folder), [])
    } finally {
      chmodSync(folder, 0o755)
    }
  })

  test("refuses a root not in the list, and a config it can't read", async () => {
    const { root, seed, tracking, repoFile } = places()
    const other = join(root, 'other')
    assert.deepEqual(
      await saveRepoStack(tracking, { root: other, stack: null }),
      {
        ok: false,
        message: `${other} isn't in the list`,
        log: null,
      },
    )
    writeFileSync(repoFile, '{ not json')
    const broken = await saveRepoStack(tracking, { root: seed, stack: null })
    assert.ok('ok' in broken && !broken.ok)
    assert.match(
      broken.message,
      /isn't JSON: .* the monitor won't overwrite it\.$/,
    )
  })

  test('refuses to save for the seed while STACK_MONITOR_CONFIG names its config', async () => {
    const { root, seed, tracking, personal } = places()
    const named = join(root, 'named.json')
    writeJson(named, {})
    process.env.STACK_MONITOR_CONFIG = named
    try {
      const saved = await saveRepoStack(tracking, { root: seed, stack: null })
      assert.ok('ok' in saved && !saved.ok)
      assert.match(saved.message, /^STACK_MONITOR_CONFIG names /)
      assert.equal(existsSync(personal), false)
    } finally {
      delete process.env.STACK_MONITOR_CONFIG
    }
  })
})
