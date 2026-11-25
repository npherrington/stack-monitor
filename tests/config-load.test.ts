import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, test } from 'node:test'

import { configCandidates, loadConfig } from '../core/config/load.ts'
import { tempDir, writeJson } from './fixtures.ts'

// A primary checkout called "myapp" and a home directory, both empty, under one temp dir.
function places() {
  const root = tempDir()
  const primary = join(root, 'myapp')
  const home = join(root, 'home')
  mkdirSync(primary)
  mkdirSync(join(home, '.config', 'stack-monitor'), { recursive: true })
  const userFile = join(home, '.config', 'stack-monitor', 'myapp.json')
  return { root, primary, home, userFile, env: {} as NodeJS.ProcessEnv }
}

describe('loading the config', () => {
  test('without a file, the defaults apply and no source is named', () => {
    const { primary, home, env } = places()
    const loaded = loadConfig({ primary, home, env })
    assert.equal(loaded.ok, true)
    assert.equal(loaded.path, null)
  })

  test("reads the primary checkout's stack-monitor.json", () => {
    const { primary, home, env } = places()
    writeJson(join(primary, 'stack-monitor.json'), { mainline: 'origin/trunk' })
    const loaded = loadConfig({ primary, home, env })
    assert.ok(loaded.ok)
    assert.equal(loaded.path, join(primary, 'stack-monitor.json'))
    assert.equal(loaded.config.mainline, 'origin/trunk')
  })

  test('falls back to the user config named after the primary', () => {
    const { primary, home, env, userFile } = places()
    writeJson(userFile, { mainline: 'origin/dev' })
    const loaded = loadConfig({ primary, home, env })
    assert.ok(loaded.ok)
    assert.equal(loaded.path, userFile)
  })

  test("the repo's file wins over the user's", () => {
    const { primary, home, env, userFile } = places()
    writeJson(userFile, {})
    writeJson(join(primary, 'stack-monitor.json'), {})
    assert.equal(
      loadConfig({ primary, home, env }).path,
      join(primary, 'stack-monitor.json'),
    )
  })

  test('the user config follows XDG_CONFIG_HOME', () => {
    const { root, primary, home } = places()
    const env = { XDG_CONFIG_HOME: join(root, 'xdg') }
    assert.equal(
      configCandidates({ primary, home, env })[1].path,
      join(root, 'xdg', 'stack-monitor', 'myapp.json'),
    )
  })

  test('for the seed, STACK_MONITOR_CONFIG is the only place looked when it is set', () => {
    const { root, primary, home } = places()
    writeJson(join(primary, 'stack-monitor.json'), {})
    const named = join(root, 'elsewhere.json')
    const env = { STACK_MONITOR_CONFIG: named }
    const personal = join(root, 'personal.json')
    writeJson(personal, {})
    const missing = loadConfig({ primary, personal, seed: true, home, env })
    assert.deepEqual(missing, {
      ok: false,
      path: named,
      problem: `STACK_MONITOR_CONFIG names ${named}, which doesn't exist`,
    })
    writeJson(named, {})
    assert.equal(loadConfig({ primary, seed: true, home, env }).path, named)
  })

  test('STACK_MONITOR_CONFIG names no other repo’s config', () => {
    const { root, primary, home } = places()
    const env = { STACK_MONITOR_CONFIG: join(root, 'elsewhere.json') }
    writeJson(env.STACK_MONITOR_CONFIG, {})
    assert.equal(loadConfig({ primary, home, env }).path, null)
  })

  test('the personal file comes first, then the repo’s, then the user file', () => {
    const { root, primary, home, env, userFile } = places()
    const personal = join(root, 'repos', 'myapp-12345678.json')
    assert.deepEqual(
      configCandidates({ primary, personal, home, env }).map(
        ({ path }) => path,
      ),
      [personal, join(primary, 'stack-monitor.json'), userFile],
    )
    mkdirSync(join(root, 'repos'))
    for (const file of [userFile, join(primary, 'stack-monitor.json')]) {
      writeJson(file, {})
    }
    assert.equal(
      loadConfig({ primary, personal, home, env }).path,
      join(primary, 'stack-monitor.json'),
    )
    writeJson(personal, { mainline: 'origin/mine' })
    const loaded = loadConfig({ primary, personal, home, env })
    assert.ok(loaded.ok)
    assert.equal(loaded.path, personal)
    assert.equal(loaded.config.mainline, 'origin/mine')
  })

  test('says a file that is not JSON is not, naming it', () => {
    const { primary, home, env } = places()
    const file = join(primary, 'stack-monitor.json')
    writeFileSync(file, '{ "mainline": ')
    const loaded = loadConfig({ primary, home, env })
    assert.equal(loaded.ok, false)
    assert.match(
      !loaded.ok ? loaded.problem : '',
      new RegExp(`^${file} isn't JSON: `),
    )
  })

  test("names the file and each field that's wrong", () => {
    const { primary, home, env } = places()
    const file = join(primary, 'stack-monitor.json')
    writeJson(file, { mainline: '-x', featureMap: { blocks: '/abs' } })
    const loaded = loadConfig({ primary, home, env })
    assert.deepEqual(loaded, {
      ok: false,
      path: file,
      problem: `${file}: mainline: must be a git ref such as origin/main; featureMap.blocks: must be a path inside the checkout, without ..`,
    })
  })
})
