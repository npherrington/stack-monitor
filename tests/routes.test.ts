import assert from 'node:assert/strict'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'

import type { Serving } from '../server/http.ts'
import { startMonitor } from '../server/monitor.ts'
import { git, gitRepo, tempDir, writeJson } from './fixtures.ts'
import { send } from './http-client.ts'

describe('the routes', () => {
  let monitor: Serving
  let primary: string
  let linked: string
  const saved = process.env.STACK_MONITOR_CONFIG

  before(async () => {
    // Whatever the shell running the tests names would be read instead of the fixture's.
    delete process.env.STACK_MONITOR_CONFIG
    const root = tempDir()
    primary = gitRepo(join(root, 'app'))
    linked = join(root, 'app-wt1')
    git(primary, 'worktree', 'add', '-q', '-b', 'feature', linked)
    monitor = await startMonitor({
      port: 0,
      repo: linked,
      dist: join(root, 'dist'),
      unbuilt: '',
    })
  })
  after(async () => {
    await monitor.stop()
    if (saved !== undefined) process.env.STACK_MONITOR_CONFIG = saved
  })

  const get = async (path: string) => {
    const answer = await send(monitor.port, {
      path,
      headers: { host: `127.0.0.1:${monitor.port}` },
    })
    return { status: answer.status, body: JSON.parse(answer.text) }
  }

  test('health names the app, the checkout it serves and its pid', async () => {
    assert.deepEqual(await get('/api/health'), {
      status: 200,
      body: { app: 'stack-monitor', root: linked, pid: process.pid },
    })
  })

  test("config reads the primary's file, from a linked checkout", async () => {
    assert.deepEqual((await get('/api/config')).body, {
      ok: true,
      repo: linked,
      source: null,
      modules: {
        worktrees: true,
        stack: false,
        agents: false,
        featureMap: true,
      },
    })
    const file = join(primary, 'stack-monitor.json')
    writeJson(file, {
      stack: { services: { api: { start: 'x', status: { command: 'true' } } } },
    })
    const { body } = await get('/api/config')
    assert.equal(body.source, file)
    assert.equal(body.modules.stack, true)
  })

  test('config says what is wrong with a broken file', async () => {
    const file = join(primary, 'stack-monitor.json')
    writeJson(file, { stack: {} })
    const { status, body } = await get('/api/config')
    assert.equal(status, 200)
    assert.equal(body.ok, false)
    assert.equal(
      body.problem,
      `${file}: stack.services: Invalid input: expected record, received undefined`,
    )
  })
})
