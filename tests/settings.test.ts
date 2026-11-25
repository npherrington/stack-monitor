import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { describe, test } from 'node:test'

import {
  personalConfigPath,
  readRepoList,
  readSettings,
  settingsPath,
  writeSettings,
} from '../core/settings.ts'
import { tempDir, writeJson } from './fixtures.ts'

describe('the settings file', () => {
  test('STACK_MONITOR_SETTINGS names it outright', () => {
    const env = { STACK_MONITOR_SETTINGS: '/x/s.json', XDG_CONFIG_HOME: '/y' }
    assert.equal(settingsPath(env, '/home/me'), '/x/s.json')
  })

  test('otherwise it is a dotfile in the user config dir, which follows XDG_CONFIG_HOME', () => {
    assert.equal(
      settingsPath({}, '/home/me'),
      '/home/me/.config/stack-monitor/.monitor.json',
    )
    assert.equal(
      settingsPath({ XDG_CONFIG_HOME: '/xdg' }, '/home/me'),
      '/xdg/stack-monitor/.monitor.json',
    )
  })

  test('a missing file reads as not set up yet, and the list is the seed', () => {
    const path = join(tempDir(), 'settings.json')
    assert.deepEqual(readSettings(path), { found: false })
    assert.deepEqual(readRepoList(path, '/src/my-app'), {
      settings: { repos: [{ root: '/src/my-app', name: 'my-app' }] },
      repos: [{ root: '/src/my-app', name: 'my-app' }],
    })
    assert.equal(existsSync(path), false, 'reading never writes it')
  })

  test('once written, the file is the list and the seed is no longer added', () => {
    const path = join(tempDir(), 'settings.json')
    const repos = { repos: [{ root: '/src/other', name: 'Other' }] }
    writeSettings(path, repos)
    assert.deepEqual(readRepoList(path, '/src/my-app'), {
      settings: repos,
      repos: repos.repos,
    })
    writeSettings(path, { repos: [] })
    assert.deepEqual(readRepoList(path, '/src/my-app'), {
      settings: { repos: [] },
      repos: [],
    })
  })

  test('keeps keys it does not know through a rewrite', () => {
    const path = join(tempDir(), 'settings.json')
    writeJson(path, { repos: [], later: { x: 1 } })
    const list = readRepoList(path, '/src/my-app')
    assert.ok(!('problem' in list))
    writeSettings(path, { ...list.settings, repos: [] })
    assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), {
      repos: [],
      later: { x: 1 },
    })
  })

  test('says what is wrong with a file that is not JSON or not the right shape', () => {
    const path = join(tempDir(), 'settings.json')
    writeFileSync(path, '{ "repos": ')
    const notJson = readRepoList(path, '/src/my-app')
    assert.ok('problem' in notJson)
    assert.match(
      notJson.problem,
      new RegExp(`^The settings file ${path} isn't JSON: `),
    )
    writeJson(path, { repos: [{ root: 'relative', name: '' }] })
    assert.deepEqual(readRepoList(path, '/src/my-app'), {
      problem: `The settings file ${path} isn't valid: repos.0.root: must be an absolute path; repos.0.name: Too small: expected string to have >=1 characters`,
    })
  })

  test('a file it cannot read is a problem, not a missing file', () => {
    const path = join(tempDir(), 'settings.json')
    mkdirSync(path)
    const read = readSettings(path)
    assert.ok('problem' in read)
    assert.match(read.problem, /^Couldn't read the settings file /)
  })

  test('a write makes the directory, and leaves no temp file behind', () => {
    const dir = join(tempDir(), 'deep', 'er')
    const path = join(dir, '.monitor.json')
    writeSettings(path, { repos: [{ root: '/a', name: 'a' }] })
    assert.deepEqual(readdirSync(dir), ['.monitor.json'])
    assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), {
      repos: [{ root: '/a', name: 'a' }],
    })
  })

  test('a write that fails leaves what was there and no temp file', () => {
    const dir = tempDir()
    const path = join(dir, 'settings.json')
    // A non-empty directory where the file goes: the rename over it fails.
    mkdirSync(join(path, 'inside'), { recursive: true })
    assert.throws(() => writeSettings(path, { repos: [] }))
    assert.deepEqual(readdirSync(dir), ['settings.json'])
    assert.deepEqual(readdirSync(path), ['inside'])
  })
})

describe('the personal config path', () => {
  test('sits in repos/ beside the settings file, named after the folder and a hash of the root', () => {
    const path = personalConfigPath('/conf/.monitor.json', '/src/my-app')
    assert.match(path, /^\/conf\/repos\/my-app-[0-9a-f]{8}\.json$/)
    // The first 8 hex of sha256('/src/my-app').
    const hash = createHash('sha256').update('/src/my-app').digest('hex')
    assert.equal(path, `/conf/repos/my-app-${hash.slice(0, 8)}.json`)
  })

  test('keeps two repos with the same folder name apart', () => {
    const a = personalConfigPath('/conf/s.json', '/src/a/app')
    const b = personalConfigPath('/conf/s.json', '/src/b/app')
    assert.notEqual(a, b)
    assert.equal(personalConfigPath('/conf/s.json', '/src/a/app'), a)
  })
})
