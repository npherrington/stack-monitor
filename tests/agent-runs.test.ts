import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'

import {
  newRunId,
  readExit,
  RUN_ID,
  type Meta,
} from '../core/agents/run-files.ts'
import { listRuns, readRun, startRun, stopRun } from '../core/agents/runs.ts'
import { writeJsonFile, type Tracking } from '../core/settings.ts'
import type { RunDetail, StartRunRequest } from '../core/types.ts'
import { fakeClaude } from './agent-fakes.ts'
import { git, gitRepo, tempDir, writeJson } from './fixtures.ts'

// Polls the run until it reads as `until` says, or fails after a few seconds.
async function waitFor(
  id: string,
  dir: string,
  until: (detail: RunDetail) => boolean,
): Promise<RunDetail> {
  const deadline = Date.now() + 10_000
  for (;;) {
    const detail = await readRun(id, dir)
    if (detail !== null && until(detail)) return detail
    if (Date.now() > deadline) {
      assert.fail(`run ${id} read ${JSON.stringify(detail?.run)}`)
    }
    await new Promise((wait) => setTimeout(wait, 50))
  }
}

const ended = (detail: RunDetail) => detail.run.state !== 'running'

describe('agent runs', () => {
  let tracking: Tracking
  let primary: string
  let linked: string
  let other: string
  let runs: string
  const saved = process.env.STACK_MONITOR_CONFIG

  before(() => {
    delete process.env.STACK_MONITOR_CONFIG
    const root = tempDir()
    primary = gitRepo(join(root, 'app'))
    linked = join(root, 'app-wt1')
    git(primary, 'worktree', 'add', '-q', '-b', 'feature', linked)
    other = join(root, 'app-wt2')
    git(primary, 'worktree', 'add', '-q', '-b', 'other', other)
    writeJson(join(primary, 'stack-monitor.json'), {
      agents: { env: { FAKE_ENV: 'from-config' } },
    })
    const settings = join(root, 'config', '.monitor.json')
    writeJsonFile(settings, {
      repos: [{ root: primary, name: 'app' }],
      agents: {
        agents: {
          claude: { program: fakeClaude(root), model: 'sonnet' },
          opencode: { program: join(root, 'no-such-opencode') },
        },
      },
    })
    tracking = { settings, seed: primary }
    runs = join(root, 'runs')
  })
  after(() => {
    if (saved !== undefined) process.env.STACK_MONITOR_CONFIG = saved
  })

  const request = (
    checkout: string,
    ...prompts: string[]
  ): StartRunRequest => ({
    checkout,
    permissions: 'edit',
    steps: prompts.map((prompt, at) => ({
      agent: 'claude',
      model: null,
      prompt,
      title: `Step ${at + 1}`,
    })),
  })

  test('runs two steps in order in the checkout, with the repo env, and reads back their report and cost', async () => {
    const started = await startRun(
      tracking,
      {
        ...request(linked, 'do the first', 'do the SECOND-STEP'),
        title: 'Both',
      },
      'task',
      { dir: runs },
    )
    assert.equal(started.ok, true, started.message)
    assert.match(started.runId ?? '', RUN_ID)
    const id = started.runId ?? ''
    const { run, events, stderr } = await waitFor(id, runs, ended)
    assert.deepEqual(
      { ...run, startedAt: '', endedAt: '' },
      {
        id,
        kind: 'task',
        title: 'Both',
        root: primary,
        checkout: linked,
        permissions: 'edit',
        steps: [
          { agent: 'claude', model: 'sonnet', title: 'Step 1' },
          { agent: 'claude', model: 'sonnet', title: 'Step 2' },
        ],
        step: 1,
        state: 'done',
        startedAt: '',
        endedAt: '',
        cost: 0.75,
        report: 'second done',
        resume: 'claude --resume sess-two',
      },
    )
    assert.ok(run.endedAt !== null && run.endedAt >= run.startedAt)
    assert.deepEqual(events.slice(0, 6), [
      { kind: 'step', step: 0, state: 'started' },
      {
        kind: 'text',
        step: 0,
        text: `cwd=${linked} env=from-config`,
      },
      { kind: 'tool', step: 0, name: 'Read', detail: 'README' },
      { kind: 'report', step: 0, text: 'first done' },
      { kind: 'cost', step: 0, usd: 0.25 },
      { kind: 'step', step: 0, state: 'finished' },
    ])
    assert.deepEqual(events.at(-1), {
      kind: 'step',
      step: 1,
      state: 'finished',
    })
    assert.equal(stderr, '')
    const dir = join(runs, id)
    const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'))
    assert.deepEqual(meta.steps[0].command.argv, [
      '-p',
      '--output-format',
      'stream-json',
      '--verbose',
      '--model',
      'sonnet',
      '--permission-mode',
      'acceptEdits',
      'do the first',
    ])
    assert.deepEqual(readExit(dir)?.steps, [
      { code: 0, signal: null },
      { code: 0, signal: null },
    ])
    const [listed] = await listRuns(runs, primary)
    assert.deepEqual(listed, run)
    assert.deepEqual(await listRuns(runs, '/somewhere/else'), [])
  })

  test('a failed first step ends the run there', async () => {
    const started = await startRun(
      tracking,
      request(linked, 'FAIL-NOW please', 'never reached'),
      'task',
      { dir: runs },
    )
    assert.equal(started.ok, true, started.message)
    const id = started.runId ?? ''
    const { run, events, stderr } = await waitFor(id, runs, ended)
    assert.equal(run.state, 'failed')
    assert.equal(run.step, 0)
    assert.equal(run.title, 'Step 1')
    assert.equal(run.report, null)
    assert.equal(run.cost, 0.01)
    assert.deepEqual(events.slice(-3), [
      { kind: 'error', step: 0, text: 'it broke' },
      { kind: 'cost', step: 0, usd: 0.01 },
      { kind: 'step', step: 0, state: 'failed' },
    ])
    assert.equal(stderr, 'it broke\n')
    assert.equal(existsSync(join(runs, id, 'step-1.jsonl')), false)
    assert.deepEqual(readExit(join(runs, id))?.steps, [
      { code: 1, signal: null },
    ])
  })

  test('SIGTERM stops the step running, and a second run waits until it has', async () => {
    const started = await startRun(
      tracking,
      request(other, 'HANG-NOW please', 'never reached'),
      'task',
      { dir: runs },
    )
    assert.equal(started.ok, true, started.message)
    const id = started.runId ?? ''
    await waitFor(id, runs, ({ events }) =>
      events.some((event) => event.kind === 'tool'),
    )
    const busy = await startRun(tracking, request(other, 'another'), 'task', {
      dir: runs,
    })
    assert.equal(busy.ok, false)
    assert.equal(busy.runId, null)
    assert.match(busy.message, /is still running in .*app-wt2/)
    const stop = await stopRun(id, runs)
    assert.equal(stop.ok, true, stop.message)
    const { run, stderr } = await waitFor(id, runs, ended)
    assert.equal(run.state, 'stopped')
    // Linux's sh may also report the killed child as Terminated.
    assert.match(stderr, /(^|\n)got TERM\n$/)
    assert.deepEqual(readExit(join(runs, id))?.steps, [
      { code: 143, signal: null },
    ])
    const again = await stopRun(id, runs)
    assert.equal(again.ok, false)
    assert.match(again.message, /has already ended/)
  })

  test('a launcher that vanished without an exit file reads as failed', async () => {
    const id = newRunId()
    const dir = join(runs, id)
    mkdirSync(dir, { recursive: true })
    const meta: Meta = {
      id,
      kind: 'task',
      title: 'Gone',
      root: primary,
      checkout: linked,
      permissions: 'read',
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
    }
    writeJsonFile(join(dir, 'meta.json'), meta)
    writeFileSync(
      join(dir, 'step-0.jsonl'),
      '{"type":"system","subtype":"init","session_id":"s-1"}\n',
    )
    const dead = spawnSync('/usr/bin/true').pid
    writeFileSync(join(dir, 'pid'), `${dead}\n`)
    const read = await readRun(id, runs)
    assert.equal(read?.run.state, 'failed')
    assert.notEqual(read?.run.endedAt, null)
    assert.deepEqual(read?.events.at(-1), {
      kind: 'error',
      step: 0,
      text: 'the launcher stopped without recording an exit',
    })
    // A live pid that isn't this run's launcher (the test runner's) is no better.
    writeFileSync(join(dir, 'pid'), `${process.pid}\n`)
    assert.equal((await readRun(id, runs))?.run.state, 'failed')
    const stop = await stopRun(id, runs)
    assert.equal(stop.ok, false)
  })

  test('refuses a checkout outside the tracked repos, a missing agent, and a wrong step count', async () => {
    const stray = gitRepo(join(tempDir(), 'stray'))
    const outside = await startRun(tracking, request(stray, 'x'), 'task', {
      dir: runs,
    })
    assert.equal(outside.ok, false)
    assert.match(outside.message, /isn't a worktree of a tracked repo/)
    const missing = await startRun(
      tracking,
      {
        checkout: linked,
        permissions: 'read',
        steps: [{ agent: 'opencode', model: null, prompt: 'x' }],
      },
      'task',
      { dir: runs },
    )
    assert.equal(missing.ok, false)
    assert.match(missing.message, /OpenCode isn't installed/)
    const none = await startRun(tracking, request(linked), 'task', {
      dir: runs,
    })
    assert.match(none.message, /1 to 4 steps/)
    const five = await startRun(
      tracking,
      request(linked, '1', '2', '3', '4', '5'),
      'task',
      { dir: runs },
    )
    assert.match(five.message, /1 to 4 steps/)
  })

  test('ids that are not run ids are never looked up', async () => {
    assert.equal(await readRun('../../etc', runs), null)
    assert.equal(await readRun(newRunId(), runs), null)
    assert.equal((await stopRun('nope', runs)).ok, false)
  })
})
