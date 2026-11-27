import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, test } from 'node:test'

import {
  checkState,
  failedStep,
  HeadChecks,
  ListRollup,
  listSummary,
  LOG_LINES,
  pullChecks,
  rerunTarget,
  summarize,
} from '../core/github/checks.ts'
import type { CheckState } from '../core/types.ts'

const data = (name: string) =>
  readFileSync(new URL(`./data/${name}`, import.meta.url), 'utf8')

// A recorded answer to CHECKS_QUERY for PR #21, edited to hold CI #68 with a failed job, CI #67's
// earlier Lint on the same commit, a Deploy preview run still going, a cancelled Nightly run, a
// check from another app and a pending commit status.
const recorded = () =>
  pullChecks(HeadChecks.parse(JSON.parse(data('github-checks.json')).data))

describe('checkState', () => {
  test('maps every status, conclusion and commit state', () => {
    const cases: [Parameters<typeof checkState>[0], CheckState][] = [
      [{ status: 'COMPLETED', conclusion: 'SUCCESS' }, 'pass'],
      [{ status: 'COMPLETED', conclusion: 'FAILURE' }, 'fail'],
      [{ status: 'COMPLETED', conclusion: 'TIMED_OUT' }, 'fail'],
      [{ status: 'COMPLETED', conclusion: 'ACTION_REQUIRED' }, 'fail'],
      [{ status: 'COMPLETED', conclusion: 'STARTUP_FAILURE' }, 'fail'],
      [{ status: 'COMPLETED', conclusion: 'CANCELLED' }, 'cancelled'],
      [{ status: 'COMPLETED', conclusion: 'SKIPPED' }, 'skipped'],
      [{ status: 'COMPLETED', conclusion: 'NEUTRAL' }, 'skipped'],
      [{ status: 'COMPLETED', conclusion: 'STALE' }, 'skipped'],
      [{ status: 'IN_PROGRESS', conclusion: null }, 'pending'],
      [{ status: 'QUEUED', conclusion: null }, 'pending'],
      [{ status: 'WAITING', conclusion: null }, 'pending'],
      [{ state: 'SUCCESS' }, 'pass'],
      [{ state: 'FAILURE' }, 'fail'],
      [{ state: 'ERROR' }, 'fail'],
      [{ state: 'PENDING' }, 'pending'],
      [{ state: 'EXPECTED' }, 'pending'],
    ]
    for (const [given, expected] of cases) {
      assert.equal(checkState(given), expected, JSON.stringify(given))
    }
  })
})

describe('summarize', () => {
  test('puts failing before pending before passing, and an empty list is none', () => {
    const cases: [CheckState[], string][] = [
      [['pass', 'pending', 'fail'], 'failing'],
      [['pass', 'cancelled'], 'failing'],
      [['pass', 'pending', 'skipped'], 'pending'],
      [['pass', 'skipped'], 'passing'],
      [['skipped'], 'passing'],
      [[], 'none'],
    ]
    for (const [states, expected] of cases) {
      assert.equal(summarize(states), expected, states.join())
    }
  })
})

describe('listSummary', () => {
  test("parses gh pr list's rollup, and a missing one reads as none", () => {
    const rollup = ListRollup.parse([
      {
        __typename: 'CheckRun',
        name: 'Lint',
        status: 'COMPLETED',
        conclusion: 'SUCCESS',
        startedAt: '2026-11-27T10:43:18Z',
        completedAt: '2026-11-27T10:43:55Z',
        detailsUrl: 'https://github.com/o/r/actions/runs/1/job/2',
        workflowName: 'CI',
      },
      {
        __typename: 'StatusContext',
        context: 'codecov/patch',
        state: 'PENDING',
        targetUrl: 'https://codecov.io',
        startedAt: '2026-11-27T10:43:10Z',
      },
    ])
    assert.equal(listSummary(rollup), 'pending')
    assert.equal(listSummary(ListRollup.parse(null)), 'none')
    assert.equal(listSummary(ListRollup.parse([])), 'none')
  })

  test('a queued re-run supersedes the failed attempt, though gh writes its start as year 1', () => {
    // A row as gh pr list --json statusCheckRollup writes it, once Re-run failed jobs is clicked.
    const job = 'https://github.com/o/r/actions/runs/45718809475/job/'
    const rollup = ListRollup.parse([
      {
        __typename: 'CheckRun',
        completedAt: '2026-11-25T23:07:25Z',
        conclusion: 'FAILURE',
        detailsUrl: `${job}139571610360`,
        name: 'Test (ubuntu-latest)',
        startedAt: '2026-11-25T23:07:08Z',
        status: 'COMPLETED',
        workflowName: 'CI',
      },
      {
        __typename: 'CheckRun',
        completedAt: '0001-01-01T00:00:00Z',
        conclusion: '',
        detailsUrl: `${job}139589393611`,
        name: 'Test (ubuntu-latest)',
        startedAt: '0001-01-01T00:00:00Z',
        status: 'QUEUED',
        workflowName: 'CI',
      },
    ])
    assert.equal(listSummary(rollup), 'pending')
  })

  test("a later run of a workflow supersedes the earlier run's every job", () => {
    const job = (run: number, name: string, conclusion: string) => ({
      __typename: 'CheckRun',
      name,
      status: 'COMPLETED',
      conclusion,
      startedAt: `2026-11-27T10:${run % 60}:00Z`,
      detailsUrl: `https://github.com/o/r/actions/runs/${run}/job/1`,
      workflowName: 'CI',
    })
    const rollup = ListRollup.parse([
      job(14, 'Docs', 'FAILURE'), // only in the earlier run
      job(14, 'Lint', 'FAILURE'),
      job(22, 'Lint', 'SUCCESS'),
    ])
    assert.equal(listSummary(rollup), 'passing')
  })
})

describe('pullChecks', () => {
  test("puts jobs under their run, and statuses and other apps' checks apart", () => {
    const { sha, groups, summary, failing, running, cut } = recorded()
    assert.equal(sha, 'b0fc70f04c9a757936abd4f5dbb1af31005a4cda')
    assert.deepEqual(
      { summary, failing, running, cut },
      { summary: 'failing', failing: 2, running: true, cut: false },
    )
    assert.deepEqual(
      groups.map((group) =>
        group.run === null
          ? null
          : `${group.run.workflow} #${group.run.number}`,
      ),
      ['CI #68', 'Deploy preview #12', 'Nightly #30', null],
    )
    const [ci, deploy, , other] = groups
    assert.deepEqual(
      ci.checks.map((check) => [check.name, check.state]),
      [
        ['Test (ubuntu-latest)', 'fail'],
        ['Build', 'pass'],
        ['Lint', 'pass'],
        ['Test (macos-latest)', 'pass'],
      ],
    )
    assert.equal(ci.checks[0].job, 140456415832)
    assert.equal(ci.checks[0].seconds, 37)
    assert.deepEqual(
      deploy.checks.map((check) => [check.name, check.seconds]),
      [
        ['Deploy', null],
        ['Smoke test', null],
      ],
    )
    assert.deepEqual(
      other.checks.map((check) => [check.name, check.state, check.job]),
      [
        ['codecov/patch', 'pending', null],
        ['Preview', 'pass', null],
      ],
    )
  })

  test('only links out over http(s)', () => {
    const other = recorded().groups.at(-1)
    assert.equal(other?.checks[0].url, null)
    assert.equal(other?.checks[1].url, 'https://vercel.com/example/preview')
  })

  test('only a run that completed and failed is rerunnable', () => {
    assert.deepEqual(
      recorded().groups.map((group) => group.run?.rerunnable ?? null),
      [true, false, false, null],
    )
  })
})

describe('rerunTarget', () => {
  test('takes a failed run on the head commit, and refuses a running, cancelled, superseded or unknown one', () => {
    const checks = recorded()
    const allowed = rerunTarget(checks, 21, 45984465587)
    assert.ok(!('refused' in allowed))
    assert.equal(`${allowed.workflow} #${allowed.number}`, 'CI #68')
    const refusals: [number, RegExp][] = [
      [45984465600, /^Deploy preview #12 hasn't failed, or is still going$/],
      [45984465700, /^Nightly #30 hasn't failed, or is still going$/],
      [
        45984400000,
        /^That run isn't one of #21's checks on its latest commit$/,
      ], // CI #67
      [1, /^That run isn't one of #21's checks/],
    ]
    for (const [run, message] of refusals) {
      const answer = rerunTarget(checks, 21, run)
      assert.ok('refused' in answer, String(run))
      assert.match(answer.refused, message)
    }
  })

  test('says the list was cut when the run may be past the first 100 checks', () => {
    const answer = rerunTarget({ ...recorded(), cut: true }, 21, 1)
    assert.ok('refused' in answer)
    assert.match(answer.refused, /among the first 100/)
  })
})

describe('failedStep', () => {
  test('cuts the failing step out of the job log', () => {
    const log = failedStep(data('actions-job-failed.log'))
    assert.equal(log.failed, true)
    assert.equal(log.step, 'Run mise run test')
    assert.equal(log.cut, false)
    assert.equal(log.lines[0].text, 'Run mise run test')
    const last = log.lines.at(-1)
    assert.deepEqual(last, {
      number: 39,
      text: 'Process completed with exit code 1.',
      error: true,
    })
    assert.equal(log.lines[0].number, 7)
    const text = log.lines.map((line) => line.text).join('\n')
    assert.doesNotMatch(text, /Post job cleanup/)
    assert.doesNotMatch(text, /\d{4}-\d\d-\d\dT[\d:.]+Z /)
    assert.doesNotMatch(text, /##\[/)
    assert.ok(!text.includes(String.fromCharCode(0x1b)))
    assert.match(text, /task failed/)
  })

  test('keeps the last lines of a long step, and a log without an error has no step', () => {
    const output = Array.from({ length: LOG_LINES + 50 }, (_, i) => `line ${i}`)
    const failed = failedStep(
      [
        '##[group]Run make',
        ...output,
        '##[error]boom',
        'Post job cleanup.',
      ].join('\n'),
    )
    assert.equal(failed.step, 'Run make')
    assert.equal(failed.cut, true)
    assert.equal(failed.lines.length, LOG_LINES)
    assert.equal(failed.lines.at(-1)?.text, 'boom')

    const passed = failedStep(['##[group]Run make', 'ok', ''].join('\n'))
    assert.equal(passed.failed, false)
    assert.equal(passed.step, null)
    assert.deepEqual(
      passed.lines.map((line) => line.text),
      ['Run make', 'ok'],
    )
  })

  test('drops the runner markup, and an error before any step is cut from the top', () => {
    const log = failedStep(
      [
        'Current runner version: 2.330.0',
        '##[command]/usr/bin/git version',
        '##[warning]Node 16 is deprecated',
        '##[debug]resolving actions/foo@v9',
        '##[error]Unable to resolve action actions/foo@v9',
      ].join('\n'),
    )
    assert.equal(log.failed, true)
    assert.equal(log.step, null)
    assert.deepEqual(
      log.lines.map((line) => [line.text, line.error]),
      [
        ['Current runner version: 2.330.0', false],
        ['/usr/bin/git version', false],
        ['Node 16 is deprecated', false],
        ['resolving actions/foo@v9', false],
        ['Unable to resolve action actions/foo@v9', true],
      ],
    )
  })
})
