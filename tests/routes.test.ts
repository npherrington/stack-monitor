import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'

import { MONITOR_HOME } from '../core/monitor-address.ts'
import { personalConfigPath } from '../core/settings.ts'
import type { Serving } from '../server/http.ts'
import { startMonitor } from '../server/monitor.ts'
import { git, gitRepo, tempDir, writeJson } from './fixtures.ts'
import { send, sendJson } from './http-client.ts'

describe('the routes', () => {
  let monitor: Serving
  let root: string
  let primary: string
  let linked: string
  let settings: string
  const saved = process.env.STACK_MONITOR_CONFIG

  before(async () => {
    // Whatever the shell running the tests names would be read instead of the fixture's.
    delete process.env.STACK_MONITOR_CONFIG
    root = tempDir()
    primary = gitRepo(join(root, 'app'))
    linked = join(root, 'app-wt1')
    git(primary, 'worktree', 'add', '-q', '-b', 'feature', linked)
    settings = join(root, 'config', '.monitor.json')
    monitor = await startMonitor({
      port: 0,
      seed: primary,
      settings,
      dist: join(root, 'dist'),
      unbuilt: '',
    })
  })
  after(async () => {
    await monitor.stop()
    if (saved !== undefined) process.env.STACK_MONITOR_CONFIG = saved
  })

  const host = () => ({ host: `127.0.0.1:${monitor.port}` })
  const get = async (path: string) => {
    const answer = await send(monitor.port, { path, headers: host() })
    return { status: answer.status, body: JSON.parse(answer.text) }
  }
  const post = async (path: string, value: unknown) => {
    const answer = await sendJson(monitor.port, path, value, host())
    return { status: answer.status, body: JSON.parse(answer.text) }
  }

  test('health names the app, the repo it was started for, its pid and its folder', async () => {
    assert.deepEqual(await get('/api/health'), {
      status: 200,
      body: {
        app: 'stack-monitor',
        root: primary,
        pid: process.pid,
        home: MONITOR_HOME,
      },
    })
  })

  test('the config route is gone: repos carry each config', async () => {
    assert.equal((await get('/api/config')).status, 404)
  })

  test("repos lists the seed with its config, then follows the primary's file", async () => {
    assert.deepEqual(await get('/api/repos'), {
      status: 200,
      body: [
        {
          root: primary,
          name: 'app',
          problem: null,
          config: {
            ok: true,
            repo: primary,
            source: null,
            modules: {
              worktrees: true,
              stack: false,
              agents: false,
              featureMap: true,
            },
          },
        },
      ],
    })
    const file = join(primary, 'stack-monitor.json')
    writeJson(file, { stack: {} })
    const [repo] = (await get('/api/repos')).body
    assert.equal(repo.config.ok, false)
    assert.equal(
      repo.config.problem,
      `${file}: stack.services: Invalid input: expected record, received undefined`,
    )
    writeJson(file, {})
  })

  test('adds, renames and removes a repo, answering 409 for a refusal', async () => {
    const other = gitRepo(join(root, 'other'))
    const otherLinked = join(root, 'other-wt1')
    git(other, 'worktree', 'add', '-q', '-b', 'x', otherLinked)
    assert.deepEqual(await post('/api/repos', { path: otherLinked }), {
      status: 200,
      body: { ok: true, message: `Added other (${other})`, log: null },
    })
    const again = await post('/api/repos', { path: other, name: 'Again' })
    assert.equal(again.status, 200)
    assert.equal(again.body.message, `other (${other}) is already in the list`)
    assert.equal(
      (await post('/api/repos/rename', { root: other, name: '  Other  ' })).body
        .message,
      'Renamed other to Other',
    )
    assert.deepEqual(
      (await get('/api/repos')).body.map(
        (repo: { root: string; name: string }) => [repo.root, repo.name],
      ),
      [
        [primary, 'app'],
        [other, 'Other'],
      ],
    )
    assert.equal((await post('/api/repos/remove', { root: other })).status, 200)
    assert.deepEqual(await post('/api/repos/remove', { root: other }), {
      status: 409,
      body: { ok: false, message: `${other} isn't in the list`, log: null },
    })
  })

  test('refuses a body of the wrong shape with a 400', async () => {
    const tooLong = await post('/api/repos', {
      path: root,
      name: 'x'.repeat(61),
    })
    assert.equal(tooLong.status, 400)
    assert.match(tooLong.body.message, /^Expected \{ path, name\? \}: name: /)
    const blank = await post('/api/repos/rename', { root: primary, name: '  ' })
    assert.equal(blank.status, 400)
    assert.equal((await post('/api/repos/remove', {})).status, 400)
    assert.equal((await post('/api/repos', { path: 'a\0b' })).status, 400)
  })

  test('scan answers what it found, and refuses a folder that is not one', async () => {
    const { status, body } = await get(
      `/api/repos/scan?folder=${encodeURIComponent(root)}`,
    )
    assert.equal(status, 200)
    assert.equal(body.folder, root)
    const app = body.hits.find((hit: { root: string }) => hit.root === primary)
    assert.deepEqual(app, {
      root: primary,
      name: 'app',
      worktrees: 2,
      tracked: true,
    })
    const missing = join(root, 'nope')
    assert.deepEqual(
      await get(`/api/repos/scan?folder=${encodeURIComponent(missing)}`),
      {
        status: 400,
        body: { ok: false, message: `${missing} doesn't exist`, log: null },
      },
    )
    assert.equal((await get('/api/repos/scan')).status, 400)
  })

  test('checkouts answers each repo with its worktrees, the primary first', async () => {
    const { status, body } = await get('/api/checkouts')
    assert.equal(status, 200)
    assert.equal(body.repos[0].root, primary)
    assert.deepEqual(
      body.repos[0].checkouts.map(
        (checkout: { path: string; primary: boolean }) => [
          checkout.path,
          checkout.primary,
        ],
      ),
      [
        [primary, true],
        [linked, false],
      ],
    )
  })

  test('the stack: read where it is, saved to the personal file, refused when wrong', async () => {
    const personal = personalConfigPath(settings, primary)
    assert.deepEqual(
      await get(`/api/repos/stack?root=${encodeURIComponent(primary)}`),
      {
        status: 200,
        body: {
          root: primary,
          stack: null,
          source: join(primary, 'stack-monitor.json'),
          personal,
          editable: false,
        },
      },
    )
    const bad = await post('/api/repos/stack', {
      root: primary,
      stack: {
        services: {
          web: { start: 'x', needs: ['db'], status: { port: { base: 1 } } },
        },
      },
    })
    assert.deepEqual(bad, {
      status: 400,
      body: {
        ok: false,
        message: "stack.services.web.needs.0: db isn't one of the services",
        log: null,
      },
    })
    const stranger = join(root, 'stranger')
    assert.equal(
      (await post('/api/repos/stack', { root: stranger, stack: null })).status,
      409,
    )
    assert.deepEqual(
      await get(`/api/repos/stack?root=${encodeURIComponent(stranger)}`),
      {
        status: 409,
        body: {
          ok: false,
          message: `${stranger} isn't in the list`,
          log: null,
        },
      },
    )
    assert.equal(
      (await post('/api/repos/stack', { root: primary })).status,
      400,
    )
    const stack = {
      services: {
        web: {
          start: 'npm run dev',
          status: { port: { file: '.env', key: 'PORT' } },
        },
        marker: { start: 'touch up', status: { command: 'test -f up' } },
      },
    }
    const answer = await post('/api/repos/stack', { root: primary, stack })
    assert.equal(answer.status, 200)
    assert.equal(
      answer.body.message,
      `Saved the stack to ${personal}, with the rest of ${join(primary, 'stack-monitor.json')}`,
    )
    const read = await get(
      `/api/repos/stack?root=${encodeURIComponent(primary)}`,
    )
    assert.deepEqual(read.body, {
      root: primary,
      stack,
      source: personal,
      personal,
      editable: true,
    })
    const [repo] = (await get('/api/repos')).body
    assert.equal(repo.config.source, personal)
    assert.equal(repo.config.modules.stack, true)
  })

  test('detect suggests services from the repo’s files, and refuses an unknown root', async () => {
    writeJson(join(primary, 'package.json'), { scripts: { dev: 'vite' } })
    try {
      const { status, body } = await get(
        `/api/repos/detect?root=${encodeURIComponent(primary)}`,
      )
      assert.equal(status, 200)
      assert.deepEqual(
        body.find((found: { from: string }) => found.from === 'package.json'),
        {
          name: 'dev',
          from: 'package.json',
          service: { start: 'npm run dev', status: { port: { base: 5173 } } },
          note: "port guessed from vite's default",
        },
      )
    } finally {
      rmSync(join(primary, 'package.json'))
    }
    const stranger = join(root, 'stranger')
    assert.equal(
      (await get(`/api/repos/detect?root=${encodeURIComponent(stranger)}`))
        .status,
      409,
    )
  })

  test('the worktree settings: read as written, saved to the personal file, refused when wrong', async () => {
    const personal = personalConfigPath(settings, primary)
    const at = `/api/repos/worktrees?root=${encodeURIComponent(primary)}`
    // The stack test before this one saved the personal file.
    assert.deepEqual(await get(at), {
      status: 200,
      body: {
        root: primary,
        worktrees: {},
        source: personal,
        personal,
        editable: true,
      },
    })
    assert.deepEqual(
      await post('/api/repos/worktrees', {
        root: primary,
        worktrees: { create: 'scripts/new-worktree.sh' },
      }),
      {
        status: 400,
        body: {
          ok: false,
          message:
            'worktrees.create: must say where the branch goes with {branch}',
          log: null,
        },
      },
    )
    const stranger = join(root, 'stranger')
    assert.equal(
      (await post('/api/repos/worktrees', { root: stranger, worktrees: {} }))
        .status,
      409,
    )
    assert.equal(
      (await get(`/api/repos/worktrees?root=${encodeURIComponent(stranger)}`))
        .status,
      409,
    )
    const worktrees = { create: 'scripts/new-worktree.sh {branch}' }
    const answer = await post('/api/repos/worktrees', {
      root: primary,
      worktrees,
    })
    assert.deepEqual(answer, {
      status: 200,
      body: {
        ok: true,
        message: `Saved the worktree settings to ${personal}`,
        log: null,
      },
    })
    assert.deepEqual((await get(at)).body.worktrees, worktrees)
    const removed = await post('/api/repos/worktrees', {
      root: primary,
      worktrees: {},
    })
    assert.equal(removed.status, 200)
    assert.deepEqual((await get(at)).body.worktrees, {})
  })

  test('detect-worktrees suggests commands from the repo’s files, and refuses an unknown root', async () => {
    writeFileSync(join(primary, 'yarn.lock'), '')
    try {
      const { status, body } = await get(
        `/api/repos/detect-worktrees?root=${encodeURIComponent(primary)}`,
      )
      assert.equal(status, 200)
      assert.deepEqual(
        body.filter((found: { from: string }) => found.from === 'yarn.lock'),
        [
          {
            role: 'install',
            command: 'yarn install --immutable',
            from: 'yarn.lock',
            note: null,
          },
        ],
      )
    } finally {
      rmSync(join(primary, 'yarn.lock'))
    }
    const stranger = join(root, 'stranger')
    assert.equal(
      (
        await get(
          `/api/repos/detect-worktrees?root=${encodeURIComponent(stranger)}`,
        )
      ).status,
      409,
    )
  })

  test('checkouts carry each service’s state in each checkout, in declared order', async () => {
    // Listening from inside the linked worktree, on a port both checkouts' .env name.
    const listener = spawn(
      process.execPath,
      [
        '-e',
        "require('node:http').createServer().listen(0, '127.0.0.1', function () { console.log(this.address().port) })",
      ],
      { cwd: linked, stdio: ['ignore', 'pipe', 'inherit'] },
    )
    try {
      const [line] = await once(listener.stdout, 'data')
      const port = Number(String(line).trim())
      for (const dir of [primary, linked]) {
        writeFileSync(join(dir, '.env'), `PORT=${port}\n`)
      }
      writeFileSync(join(linked, 'up'), '')
      const { status, body } = await get('/api/checkouts')
      assert.equal(status, 200)
      const [repo] = body.repos
      assert.deepEqual(repo.services, ['web', 'marker'])
      const services = (path: string) =>
        repo.checkouts.find(
          (checkout: { path: string }) => checkout.path === path,
        ).services
      assert.deepEqual(services(linked), [
        { name: 'web', state: 'up', detail: `port ${port}` },
        { name: 'marker', state: 'up', detail: null },
      ])
      assert.deepEqual(services(primary), [
        {
          name: 'web',
          state: 'down',
          detail: `port ${port} held by another checkout or program`,
        },
        { name: 'marker', state: 'down', detail: 'the check exited 1' },
      ])
    } finally {
      listener.kill()
    }
  })

  test('the GitHub routes refuse a repo that is not tracked, and a review GitHub has no event for', async () => {
    const elsewhere = encodeURIComponent(join(root, 'nowhere'))
    for (const path of [
      `/api/github/pulls?root=${elsewhere}`,
      `/api/github/pull?root=${elsewhere}&number=1`,
    ]) {
      const { status, body } = await get(path)
      assert.equal(status, 409, path)
      assert.match(body.message, /isn't in the list$/)
    }
    const review = await post('/api/github/review', {
      root: primary,
      number: 1,
      event: 'MERGE',
    })
    assert.equal(review.status, 400)
    assert.match(review.body.message, /^Expected .*: event: /)
  })

  // Last: it breaks the settings file for the tests after it.
  test('a settings file that is not valid is reported by every route that reads it', async () => {
    writeFileSync(settings, '{ "repos": [{}] }')
    for (const path of [
      '/api/repos',
      '/api/checkouts',
      `/api/repos/scan?folder=${encodeURIComponent(root)}`,
    ]) {
      const { status, body } = await get(path)
      assert.equal(status, 500, path)
      assert.match(body.message, /^The settings file .* isn't valid: /)
    }
    const add = await post('/api/repos', { path: root })
    assert.equal(add.status, 409)
    assert.match(add.body.message, /won't overwrite it\.$/)
  })
})
