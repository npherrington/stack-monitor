import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { before, describe, test } from 'node:test'

import { readRun } from '../core/agents/runs.ts'
import {
  calendarIntervals,
  matches,
  nextFires,
  parseCron,
  type Cron,
} from '../core/schedules/cron.ts'
import { fireSchedule } from '../core/schedules/fire.ts'
import { plist, scheduleJob, type Launchd } from '../core/schedules/launchd.ts'
import {
  deleteSchedule,
  listSchedules,
  runScheduleNow,
  saveSchedule,
  type ScheduleContext,
} from '../core/schedules/schedules.ts'
import { readFires } from '../core/schedules/store.ts'
import { writeJsonFile, type Tracking } from '../core/settings.ts'
import type { RunDetail, SaveScheduleRequest } from '../core/types.ts'
import { fakeClaude } from './agent-fakes.ts'
import { git, gitRepo, tempDir, writeJson } from './fixtures.ts'

delete process.env.STACK_MONITOR_CONFIG

function cron(text: string): Cron {
  const parsed = parseCron(text)
  if ('problem' in parsed) assert.fail(parsed.problem)
  return parsed
}

// Local times, as cron reads them.
const at = (text: string) => new Date(text)

describe('cron lines', () => {
  test('weekdays at 9:30, from a Friday afternoon', () => {
    const fires = nextFires(cron('30 9 * * mon-fri'), at('2026-11-27T15:00'), 3)
    assert.deepEqual(
      fires.map((each) => [each.getDay(), each.getHours(), each.getMinutes()]),
      [
        [1, 9, 30],
        [2, 9, 30],
        [3, 9, 30],
      ],
    )
  })

  test('steps, lists, presets, and both day fields meaning either', () => {
    assert.deepEqual([...cron('*/20 * * * *').minute], [0, 20, 40])
    assert.deepEqual([...cron('0 8,17 * * *').hour], [8, 17])
    assert.equal(matches(cron('@daily'), at('2026-11-25T00:00')), true)
    assert.equal(matches(cron('@daily'), at('2026-11-25T00:01')), false)
    // The 1st of the month or a Sunday: 2026-11-29 is a Sunday, not the 1st.
    assert.equal(matches(cron('0 0 1 * 0'), at('2026-11-29T00:00')), true)
    assert.equal(matches(cron('0 0 1 * 7'), at('2026-11-29T00:00')), true)
  })

  test('says what is wrong with a line', () => {
    for (const [line, said] of [
      ['* * * *', /5 fields/],
      ['60 * * * *', /minute 60/],
      ['*/0 * * * *', /step/],
      ['0 9 * * funday', /day of week/],
    ] as const) {
      const parsed = parseCron(line)
      assert.ok('problem' in parsed, line)
      assert.match(parsed.problem, said, line)
    }
  })

  test("as launchd's calendar intervals", () => {
    assert.deepEqual(calendarIntervals(cron('* * * * *')), [{}])
    assert.deepEqual(calendarIntervals(cron('0,30 9 * * 1')), [
      { Minute: 0, Hour: 9, Weekday: 1 },
      { Minute: 30, Hour: 9, Weekday: 1 },
    ])
    assert.deepEqual(calendarIntervals(cron('0 0 1 * 0')), [
      { Minute: 0, Hour: 0, Day: 1 },
      { Minute: 0, Hour: 0, Weekday: 0 },
    ])
  })

  test('the LaunchAgent plist', () => {
    const text = plist(
      scheduleJob(
        'abcd1234',
        [{ Minute: 0, Hour: 9 }],
        {
          program: '/usr/bin/node',
          args: ['/m/fire-cli.ts'],
          env: { PATH: '/bin' },
        },
        '/logs',
      ),
    )
    assert.match(
      text,
      /<key>Label<\/key>\n {2}<string>dev\.stack-monitor\.schedule\.abcd1234<\/string>/,
    )
    assert.match(
      text,
      /<string>\/m\/fire-cli\.ts<\/string>\n {4}<string>abcd1234<\/string>/,
    )
    assert.match(text, /<key>Hour<\/key>\n {6}<integer>9<\/integer>/)
    assert.match(text, /<key>AbandonProcessGroup<\/key>\n {2}<true\/>/)
  })
})

// launchd as a record of what it was asked, with the probe's answer set per test.
function fakeLaunchd() {
  const calls: string[] = []
  const loaded = new Set<string>()
  const launchd: Launchd & { calls: string[]; blocked: string | null } = {
    calls,
    blocked: null,
    program: '/usr/local/bin/node',
    reads: ['/monitor/core/schedules/fire-cli.ts'],
    errLog: (id) => `/nowhere/${id}.err`,
    async install(id, intervals) {
      calls.push(`install ${id} ${JSON.stringify(intervals)}`)
      loaded.add(id)
      return null
    },
    async remove(id) {
      calls.push(`remove ${id}`)
      loaded.delete(id)
    },
    async loaded(id) {
      return loaded.has(id)
    },
    async probe(paths) {
      calls.push(`probe ${paths.length}`)
      return launchd.blocked
    },
  }
  return launchd
}

async function waitFor(id: string, dir: string): Promise<RunDetail> {
  const deadline = Date.now() + 10_000
  for (;;) {
    const detail = await readRun(id, dir)
    if (detail !== null && detail.run.state !== 'running') return detail
    if (Date.now() > deadline) assert.fail(`run ${id} didn't end`)
    await new Promise((wait) => setTimeout(wait, 50))
  }
}

describe('schedules', () => {
  let tracking: Tracking
  let primary: string
  let context: ScheduleContext & { launchd: ReturnType<typeof fakeLaunchd> }
  let runs: string

  const prompt = (
    more: Partial<SaveScheduleRequest> = {},
  ): SaveScheduleRequest => ({
    name: 'Nightly tidy',
    cron: '0 2 * * *',
    checkout: primary,
    enabled: true,
    fireFrom: 'launchd',
    task: {
      kind: 'prompt',
      agent: 'claude',
      model: null,
      prompt: 'Tidy the README',
      permissions: 'edit',
    },
    ...more,
  })

  before(() => {
    const root = tempDir()
    primary = gitRepo(join(root, 'app'))
    const workflows = join(primary, '.agents', 'workflows')
    mkdirSync(workflows, { recursive: true })
    writeFileSync(
      join(workflows, 'check.json'),
      JSON.stringify({
        name: 'check',
        description: '',
        permissions: 'read',
        steps: [
          {
            title: 'Look',
            agent: 'claude',
            model: null,
            prompt: 'Look around',
          },
        ],
      }),
    )
    git(primary, 'add', '.')
    git(primary, 'commit', '-q', '-m', 'workflow')
    const settings = join(root, 'config', '.monitor.json')
    writeJsonFile(settings, {
      repos: [{ root: primary, name: 'app' }],
      agents: { agents: { claude: { program: fakeClaude(root) } } },
    })
    writeJson(join(primary, 'stack-monitor.json'), {})
    tracking = { settings, seed: primary }
    runs = join(root, 'runs')
    context = {
      dir: join(root, 'schedules'),
      launchd: fakeLaunchd(),
      runs: { dir: runs },
    }
  })

  test('a launchd schedule is probed, installed, and listed with its next fires', async () => {
    const result = await saveSchedule(tracking, prompt(), context)
    assert.equal(result.ok, true, result.message)
    assert.equal(result.blocked, null)
    const id = result.id ?? ''
    assert.deepEqual(context.launchd.calls, [
      'probe 2',
      `install ${id} [{"Minute":0,"Hour":2}]`,
    ])
    const list = await listSchedules(tracking, context, at('2026-11-25T12:00'))
    assert.ok(Array.isArray(list))
    assert.equal(list[0].root, primary)
    assert.equal(list[0].problem, null)
    assert.deepEqual(
      list[0].next.map((each) => new Date(each).getDate()),
      [26, 27, 28],
    )
  })

  test('a path launchd cannot read: saved, with the Full Disk Access way out', async () => {
    context.launchd.blocked = primary
    const result = await saveSchedule(
      tracking,
      prompt({ name: 'Blocked' }),
      context,
    )
    context.launchd.blocked = null
    assert.equal(result.ok, true)
    assert.deepEqual(result.blocked, {
      program: '/usr/local/bin/node',
      path: primary,
    })
    assert.match(result.message, /Full Disk Access/)
    const list = await listSchedules(tracking, context)
    assert.ok(Array.isArray(list))
    const view = list.find((each) => each.id === result.id)
    assert.match(String(view?.problem), /fire this schedule from the monitor/)
    // Switching it to the monitor takes the LaunchAgent away and the problem with it.
    const moved = await saveSchedule(
      tracking,
      prompt({ id: result.id ?? '', name: 'Blocked', fireFrom: 'monitor' }),
      context,
    )
    assert.equal(moved.ok, true, moved.message)
    assert.ok(context.launchd.calls.includes(`remove ${result.id}`))
    const again = await listSchedules(tracking, context)
    assert.ok(Array.isArray(again))
    assert.equal(again.find((each) => each.id === result.id)?.problem, null)
  })

  test('refuses a bad cron line, a checkout outside the repos, and a missing workflow', async () => {
    assert.match(
      (await saveSchedule(tracking, prompt({ cron: '0 25 * * *' }), context))
        .message,
      /hour 25/,
    )
    assert.match(
      (await saveSchedule(tracking, prompt({ checkout: tempDir() }), context))
        .message,
      /isn't a worktree of a tracked repo/,
    )
    assert.match(
      (
        await saveSchedule(
          tracking,
          prompt({ task: { kind: 'workflow', name: 'nope' } }),
          context,
        )
      ).message,
      /no workflow nope/,
    )
  })

  test('Run now starts the prompt; a due fire claims its minute once', async () => {
    const result = await saveSchedule(
      tracking,
      prompt({
        name: 'Check',
        fireFrom: 'monitor',
        task: { kind: 'workflow', name: 'check' },
      }),
      context,
    )
    const id = result.id ?? ''
    const started = await runScheduleNow(tracking, id, context)
    assert.equal(started.ok, true, started.message)
    const { run } = await waitFor(started.runId ?? '', runs)
    assert.equal(run.state, 'done')
    assert.equal(run.title, 'check')

    const minute = at('2026-11-26T02:00')
    const options = { schedules: context.dir, now: minute, dir: runs }
    const first = await fireSchedule(tracking, id, 'monitor', options)
    assert.equal(first?.ok, true, first?.message)
    await waitFor(first?.runId ?? '', runs)
    assert.equal(await fireSchedule(tracking, id, 'launchd', options), null)
    assert.deepEqual(
      readFires(context.dir)
        .filter((fire) => fire.id === id)
        .map((fire) => fire.by),
      ['monitor', 'now'],
    )
  })

  test('a fire while a run is going starts nothing and says why', async () => {
    const result = await saveSchedule(
      tracking,
      prompt({ name: 'Twice', fireFrom: 'monitor' }),
      context,
    )
    const id = result.id ?? ''
    const first = await runScheduleNow(tracking, id, context)
    const second = await runScheduleNow(tracking, id, context)
    assert.equal(first.ok, true, first.message)
    assert.equal(second.ok, false)
    assert.match(readFires(context.dir)[0].message, /is still running/)
    await waitFor(first.runId ?? '', runs)
  })

  test('delete takes the LaunchAgent away too', async () => {
    const result = await saveSchedule(
      tracking,
      prompt({ name: 'Gone' }),
      context,
    )
    const deleted = await deleteSchedule(result.id ?? '', context)
    assert.equal(deleted.ok, true)
    assert.ok(context.launchd.calls.includes(`remove ${result.id}`))
    const list = await listSchedules(tracking, context)
    assert.ok(Array.isArray(list))
    assert.equal(
      list.some((each) => each.id === result.id),
      false,
    )
  })
})
