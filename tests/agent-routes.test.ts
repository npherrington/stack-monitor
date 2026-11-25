import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'

import { RUNS_ENV } from '../core/agents/run-files.ts'
import { writeJsonFile } from '../core/settings.ts'
import type { RunDetail } from '../core/types.ts'
import type { Serving } from '../server/http.ts'
import { startMonitor } from '../server/monitor.ts'
import { fakeClaude, fakeOpencode } from './agent-fakes.ts'
import { git, gitRepo, tempDir } from './fixtures.ts'
import { send, sendJson } from './http-client.ts'

describe('the agent routes', () => {
  let monitor: Serving
  let primary: string
  let linked: string
  let claudePath: string
  let opencodePath: string
  const saved = {
    config: process.env.STACK_MONITOR_CONFIG,
    runs: process.env[RUNS_ENV],
  }

  before(async () => {
    delete process.env.STACK_MONITOR_CONFIG
    const root = tempDir()
    process.env[RUNS_ENV] = join(root, 'runs')
    primary = gitRepo(join(root, 'app'))
    linked = join(root, 'app-wt1')
    git(primary, 'worktree', 'add', '-q', '-b', 'feature', linked)
    mkdirSync(join(linked, '.claude'))
    claudePath = fakeClaude(root)
    opencodePath = fakeOpencode(root)
    const settings = join(root, 'config', '.monitor.json')
    writeJsonFile(settings, {
      repos: [{ root: primary, name: 'app' }],
      agents: {
        agents: {
          claude: { program: claudePath },
          opencode: { program: opencodePath },
        },
      },
    })
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
    for (const [key, value] of [
      ['STACK_MONITOR_CONFIG', saved.config],
      [RUNS_ENV, saved.runs],
    ] as const) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
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
  const q = encodeURIComponent

  // Runs in one checkout go one at a time, so each test waits for its run to end.
  async function ended(id: string): Promise<RunDetail> {
    const deadline = Date.now() + 10_000
    for (;;) {
      const { status, body } = await get(`/api/runs/detail?id=${id}`)
      assert.equal(status, 200)
      if (body.run.state !== 'running') return body
      if (Date.now() > deadline) assert.fail(`run ${id} still running`)
      await new Promise((wait) => setTimeout(wait, 50))
    }
  }

  test('agents lists both CLIs by their program overrides, with the defaults', async () => {
    const { status, body } = await get('/api/agents')
    assert.equal(status, 200)
    assert.deepEqual(
      body.agents.map(
        (agent: { id: string; path: string; version: string }) => [
          agent.id,
          agent.path,
          agent.version,
        ],
      ),
      [
        ['claude', claudePath, '9.9.9'],
        ['opencode', opencodePath, '0.0.1'],
      ],
    )
    assert.equal(body.default, 'claude')
    assert.deepEqual(body.designer, {
      agent: 'opencode',
      model: 'opencode/deepseek-v4.1-flash-free',
    })
    assert.equal(typeof body.ollama.running, 'boolean')
  })

  test('agent settings are saved whole, and a bad one is a 400', async () => {
    const bad = await post('/api/agents/settings', { default: 'codex' })
    assert.equal(bad.status, 400)
    const flag = await post('/api/agents/settings', {
      agents: { claude: { model: '--dangerously-skip-permissions' } },
    })
    assert.equal(flag.status, 400)
    const relative = await post('/api/agents/settings', {
      agents: { claude: { program: 'bin/claude' } },
    })
    assert.equal(relative.status, 400)
    const good = await post('/api/agents/settings', {
      default: 'opencode',
      agents: {
        claude: { program: claudePath, model: 'haiku' },
        opencode: { program: opencodePath },
      },
    })
    assert.equal(good.status, 200)
    const { body } = await get('/api/agents')
    assert.equal(body.default, 'opencode')
    assert.equal(body.agents[0].model, 'haiku')
  })

  test('starts a task, reads it back, lists it under its repo, and refuses to stop it once ended', async () => {
    const started = await post('/api/runs', {
      checkout: linked,
      permissions: 'read',
      steps: [{ agent: 'claude', model: null, prompt: 'look around' }],
    })
    assert.equal(started.status, 200, started.body.message)
    const { runId } = started.body
    const { run } = await ended(runId)
    assert.equal(run.kind, 'task')
    assert.equal(run.state, 'done')
    assert.equal(run.report, 'first done')
    assert.deepEqual(run.steps, [
      { agent: 'claude', model: 'haiku', title: null },
    ])
    const listed = await get(`/api/runs?root=${q(primary)}`)
    assert.equal(listed.status, 200)
    assert.ok(listed.body.some((each: { id: string }) => each.id === runId))
    assert.ok((await get('/api/runs')).body.length >= 1)
    const stop = await post('/api/runs/stop', { id: runId })
    assert.equal(stop.status, 409)
  })

  test('refusals: 409 for an unknown root or checkout, 400 for a bad body or run id, 404 for no such run', async () => {
    const elsewhere = gitRepo(join(tempDir(), 'elsewhere'))
    assert.equal((await get(`/api/runs?root=${q(elsewhere)}`)).status, 409)
    assert.equal((await get(`/api/skills?root=${q(elsewhere)}`)).status, 409)
    assert.equal((await get(`/api/workflows?root=${q(elsewhere)}`)).status, 409)
    const step = { agent: 'claude', model: null, prompt: 'x' }
    const outside = await post('/api/runs', {
      checkout: elsewhere,
      permissions: 'read',
      steps: [step],
    })
    assert.equal(outside.status, 409)
    assert.equal(outside.body.runId, null)
    const five = await post('/api/runs', {
      checkout: linked,
      permissions: 'read',
      steps: [step, step, step, step, step],
    })
    assert.equal(five.status, 400)
    const permissions = await post('/api/runs', {
      checkout: linked,
      permissions: 'root',
      steps: [step],
    })
    assert.equal(permissions.status, 400)
    assert.equal((await get('/api/runs/detail?id=..%2F..%2Fetc')).status, 400)
    assert.equal((await post('/api/runs/stop', { id: '../x' })).status, 400)
    const unknown = await get('/api/runs/detail?id=20260101T000000000-abcdef12')
    assert.equal(unknown.status, 404)
    const draftOutside = await post('/api/skills/draft', {
      checkout: elsewhere,
      name: 'x',
      purpose: 'p',
      triggers: 't',
    })
    assert.equal(draftOutside.status, 409)
    const badName = await post('/api/skills/draft', {
      checkout: linked,
      name: 'Bad Name',
      purpose: 'p',
      triggers: 't',
    })
    assert.equal(badName.status, 400)
  })

  test('a skill draft runs the designer with edit permissions', async () => {
    const started = await post('/api/skills/draft', {
      checkout: linked,
      name: 'deploy-docs',
      purpose: 'Publish the docs',
      triggers: 'when asked to deploy the docs',
    })
    assert.equal(started.status, 200, started.body.message)
    const { run, stderr } = await ended(started.body.runId)
    assert.equal(run.kind, 'skill')
    assert.equal(run.permissions, 'edit')
    assert.deepEqual(run.steps, [
      {
        agent: 'opencode',
        model: 'opencode/deepseek-v4.1-flash-free',
        title: null,
      },
    ])
    assert.equal(run.report, 'drafted it')
    assert.equal(run.resume, 'opencode --session ses_fake')
    assert.match(stderr, /"shell":"deny"/)
    assert.doesNotMatch(stderr, /"edit":"deny"/)

    mkdirSync(join(linked, '.agents', 'skills', 'deploy-docs'), {
      recursive: true,
    })
    writeFileSync(
      join(linked, '.agents', 'skills', 'deploy-docs', 'SKILL.md'),
      '',
    )
    const again = await post('/api/skills/draft', {
      checkout: linked,
      name: 'deploy-docs',
      purpose: 'p',
      triggers: 't',
    })
    assert.equal(again.status, 409)
    assert.match(again.body.message, /already a skill/)
  })

  test('improving a prompt is a read-only draft run, with the agent asked for', async () => {
    const started = await post('/api/prompts/improve', {
      checkout: linked,
      kind: 'step',
      text: 'fix stuff',
      agent: 'claude',
      model: 'sonnet',
    })
    assert.equal(started.status, 200, started.body.message)
    const { run } = await ended(started.body.runId)
    assert.equal(run.kind, 'draft')
    assert.equal(run.permissions, 'read')
    assert.deepEqual(run.steps, [
      { agent: 'claude', model: 'sonnet', title: null },
    ])
  })

  test('skills are listed from the primary checkout', async () => {
    mkdirSync(join(primary, '.agents', 'skills', 'ship-it'), {
      recursive: true,
    })
    writeFileSync(
      join(primary, '.agents', 'skills', 'ship-it', 'SKILL.md'),
      '---\nname: ship-it\ndescription: Ship. Use when asked to ship.\n---\n',
    )
    assert.deepEqual(await get(`/api/skills?root=${q(primary)}`), {
      status: 200,
      body: [
        {
          name: 'ship-it',
          description: 'Ship. Use when asked to ship.',
          path: '.agents/skills/ship-it/SKILL.md',
        },
      ],
    })
  })

  test('workflows are saved, listed, run in a linked checkout and deleted', async () => {
    const workflow = {
      name: 'review',
      description: 'Look, then report',
      permissions: 'read',
      steps: [
        { title: 'Look', agent: null, model: null, prompt: 'look' },
        {
          title: 'Report',
          agent: 'claude',
          model: null,
          prompt: 'the SECOND-STEP',
        },
      ],
    }
    const save = await post('/api/workflows/save', { root: primary, workflow })
    assert.equal(save.status, 200, save.body.message)
    assert.equal(
      (await post('/api/workflows/save', { root: primary, workflow })).status,
      409,
    )
    assert.equal(
      (
        await post('/api/workflows/save', {
          root: primary,
          workflow: { ...workflow, name: '../x' },
        })
      ).status,
      400,
    )
    assert.deepEqual(await get(`/api/workflows?root=${q(primary)}`), {
      status: 200,
      body: { workflows: [workflow], claude: [], problems: [] },
    })
    const started = await post('/api/workflows/run', {
      checkout: linked,
      name: 'review',
    })
    assert.equal(started.status, 200, started.body.message)
    const { run } = await ended(started.body.runId)
    assert.equal(run.kind, 'workflow')
    assert.equal(run.title, 'review')
    assert.equal(run.state, 'done')
    // The settings saved earlier made opencode the machine default.
    assert.deepEqual(
      run.steps.map((step: { agent: string }) => step.agent),
      ['opencode', 'claude'],
    )
    assert.equal(run.report, 'second done')
    const missing = await post('/api/workflows/run', {
      checkout: linked,
      name: 'nope',
    })
    assert.equal(missing.status, 409)
    const deleted = await post('/api/workflows/delete', {
      root: primary,
      name: 'review',
    })
    assert.equal(deleted.status, 200)
    assert.equal(
      (await post('/api/workflows/delete', { root: primary, name: 'review' }))
        .status,
      409,
    )
  })
})
