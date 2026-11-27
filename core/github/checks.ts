// A PR's CI checks, from either of gh's two shapes of the head commit's status check rollup, into
// one state per check: the list's one word and the Checks tab come from the same mapping. And a
// failed Actions job's log, cut down to the step that failed.
import { z } from 'zod'

import type {
  ActionsRun,
  CheckGroup,
  CheckState,
  ChecksSummary,
  JobLog,
  JobLogLine,
  PullCheck,
  PullChecks,
} from '../types.ts'

const FAILED = new Set([
  'FAILURE',
  'ERROR',
  'TIMED_OUT',
  'ACTION_REQUIRED',
  'STARTUP_FAILURE',
])
const SKIPPED = new Set(['SKIPPED', 'NEUTRAL', 'STALE'])

// A check run by its conclusion once it has completed, by its status before; a commit status by
// its state. The buckets are gh pr checks'.
export function checkState(
  given: { status: string; conclusion: string | null } | { state: string },
): CheckState {
  if ('state' in given) {
    if (given.state === 'SUCCESS') return 'pass'
    return FAILED.has(given.state) ? 'fail' : 'pending'
  }
  if (given.status !== 'COMPLETED' || given.conclusion === null) {
    return 'pending'
  }
  if (given.conclusion === 'SUCCESS') return 'pass'
  if (given.conclusion === 'CANCELLED') return 'cancelled'
  if (SKIPPED.has(given.conclusion)) return 'skipped'
  return FAILED.has(given.conclusion) ? 'fail' : 'pending'
}

// A cancelled check blocks a required check as a failed one does.
const failing = (state: CheckState) => state === 'fail' || state === 'cancelled'

export function summarize(states: CheckState[]): ChecksSummary {
  if (states.some(failing)) return 'failing'
  if (states.includes('pending')) return 'pending'
  return states.length > 0 ? 'passing' : 'none'
}

interface CheckFacts {
  workflow: string // the Actions workflow's name, or the app's
  run: number // the Actions run's id; 0 for another app's check
  name: string
  startedAt: string | null
}

// gh pr list writes a check run that hasn't started as Go's zero time.
const NOT_STARTED = '\uffff'
const started = (at: string | null) =>
  at === null || at.startsWith('0001-') ? NOT_STARTED : at

// The checks that still count, as gh pr checks leaves out superseded ones: of one workflow's runs
// on the commit (a push and a pull_request event both running CI), only the latest run; of one
// job name in it (an earlier attempt), only the newest. A job that hasn't started is the newest.
// facts null: a commit status, of which GitHub already gives the latest per context.
function current<T>(checks: T[], facts: (check: T) => CheckFacts | null): T[] {
  const known = checks.map(facts)
  const latestRun = new Map<string, number>()
  for (const each of known) {
    if (each === null) continue
    latestRun.set(
      each.workflow,
      Math.max(latestRun.get(each.workflow) ?? 0, each.run),
    )
  }
  const kept = new Map<string, number>()
  known.forEach((each, index) => {
    if (each === null || each.run !== latestRun.get(each.workflow)) return
    const key = `${each.workflow}\n${each.name}`
    const seen = kept.get(key)
    const seenAt = seen === undefined ? null : known[seen]
    if (seenAt == null || started(each.startedAt) > started(seenAt.startedAt)) {
      kept.set(key, index)
    }
  })
  const keep = new Set(kept.values())
  return checks.filter((_, index) => known[index] === null || keep.has(index))
}

const RUN_IN_URL = /\/actions\/runs\/(\d+)\//

// gh pr list --json statusCheckRollup: a flat array, or null when the head commit has none. A
// check run carries a status, a commit status a state.
export const ListRollup = z
  .array(
    z.union([
      z.object({
        name: z.string(),
        status: z.string(),
        conclusion: z.string().nullable(),
        startedAt: z.string().nullable().optional(),
        workflowName: z.string().nullable().optional(),
        detailsUrl: z.string().nullable().optional(),
      }),
      z.object({ state: z.string() }),
    ]),
  )
  .nullable()

export function listSummary(
  rollup: z.output<typeof ListRollup>,
): ChecksSummary {
  const latest = current(rollup ?? [], (check) =>
    'status' in check
      ? {
          workflow: check.workflowName ?? '',
          run: Number(RUN_IN_URL.exec(check.detailsUrl ?? '')?.[1] ?? 0),
          name: check.name,
          startedAt: check.startedAt ?? null,
        }
      : null,
  )
  return summarize(latest.map(checkState))
}

export const CHECKS_QUERY = `query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      commits(last: 1) { nodes { commit { oid statusCheckRollup { contexts(first: 100) { pageInfo { hasNextPage } nodes {
        kind: __typename
        ... on CheckRun {
          databaseId name title status conclusion startedAt completedAt detailsUrl
          checkSuite {
            status conclusion app { slug }
            workflowRun { databaseId runNumber url workflow { name } }
          }
        }
        ... on StatusContext { context state description targetUrl createdAt }
      } } } } } }
    }
  }
}`

const GhCheckRun = z.object({
  kind: z.literal('CheckRun'),
  databaseId: z.number(),
  name: z.string(),
  title: z.string().nullable(),
  status: z.string(),
  conclusion: z.string().nullable(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  detailsUrl: z.string().nullable(),
  checkSuite: z.object({
    status: z.string(),
    conclusion: z.string().nullable(),
    app: z.object({ slug: z.string() }).nullable(),
    workflowRun: z
      .object({
        databaseId: z.number(),
        runNumber: z.number(),
        url: z.string(),
        workflow: z.object({ name: z.string() }),
      })
      .nullable(),
  }),
})

const GhStatusContext = z.object({
  kind: z.literal('StatusContext'),
  context: z.string(),
  state: z.string(),
  description: z.string().nullable(),
  targetUrl: z.string().nullable(),
})

export const HeadChecks = z.object({
  repository: z.object({
    pullRequest: z.object({
      commits: z.object({
        nodes: z.array(
          z.object({
            commit: z.object({
              oid: z.string(),
              statusCheckRollup: z
                .object({
                  contexts: z.object({
                    pageInfo: z.object({ hasNextPage: z.boolean() }),
                    nodes: z.array(
                      z.discriminatedUnion('kind', [
                        GhCheckRun,
                        GhStatusContext,
                      ]),
                    ),
                  }),
                })
                .nullable(),
            }),
          }),
        ),
      }),
    }),
  }),
})

type GhContext = z.output<typeof GhCheckRun> | z.output<typeof GhStatusContext>

// It ends up in an href on the page; a commit status's target is whatever its poster set.
function webUrl(url: string | null): string | null {
  return url !== null && /^https?:\/\//i.test(url) ? url : null
}

const ORDER: Record<CheckState, number> = {
  fail: 0,
  pending: 1,
  cancelled: 2,
  pass: 3,
  skipped: 4,
}

function seconds(from: string | null, to: string | null): number | null {
  if (from === null || to === null) return null
  const ms = Date.parse(to) - Date.parse(from)
  return Number.isNaN(ms) ? null : Math.max(0, Math.round(ms / 1000))
}

function actionsRun(context: GhContext) {
  return context.kind === 'CheckRun' &&
    context.checkSuite.app?.slug === 'github-actions'
    ? context.checkSuite.workflowRun
    : null
}

function pullCheck(context: GhContext): PullCheck {
  if (context.kind === 'StatusContext') {
    return {
      name: context.context,
      state: checkState(context),
      description: context.description,
      url: webUrl(context.targetUrl),
      startedAt: null,
      seconds: null,
      job: null,
    }
  }
  return {
    name: context.name,
    state: checkState(context),
    description: context.title,
    url: webUrl(context.detailsUrl),
    startedAt: context.startedAt,
    seconds: seconds(context.startedAt, context.completedAt),
    job: actionsRun(context) === null ? null : context.databaseId,
  }
}

const byState = (a: PullCheck, b: PullCheck) =>
  ORDER[a.state] - ORDER[b.state] || a.name.localeCompare(b.name)

// The head commit's checks, Actions jobs under their run and everything else in one group.
export function pullChecks(answer: z.output<typeof HeadChecks>): PullChecks {
  const [head] = answer.repository.pullRequest.commits.nodes
  const rollup = head?.commit.statusCheckRollup ?? null
  const contexts = current(rollup?.contexts.nodes ?? [], (context) => {
    if (context.kind !== 'CheckRun') return null
    const workflowRun = actionsRun(context)
    return {
      workflow:
        workflowRun?.workflow.name ?? context.checkSuite.app?.slug ?? '',
      run: workflowRun?.databaseId ?? 0,
      name: context.name,
      startedAt: context.startedAt,
    }
  })
  const runs = new Map<number, { run: ActionsRun; checks: PullCheck[] }>()
  const other: PullCheck[] = []
  for (const context of contexts) {
    const workflowRun = actionsRun(context)
    if (workflowRun === null || context.kind !== 'CheckRun') {
      other.push(pullCheck(context))
      continue
    }
    let group = runs.get(workflowRun.databaseId)
    if (group === undefined) {
      const suite = context.checkSuite
      group = {
        run: {
          id: workflowRun.databaseId,
          workflow: workflowRun.workflow.name,
          number: workflowRun.runNumber,
          url: webUrl(workflowRun.url),
          state: checkState(suite),
          rerunnable:
            suite.status === 'COMPLETED' &&
            (suite.conclusion === 'FAILURE' ||
              suite.conclusion === 'TIMED_OUT'),
        },
        checks: [],
      }
      runs.set(workflowRun.databaseId, group)
    }
    group.checks.push(pullCheck(context))
  }
  const groups: CheckGroup[] = [...runs.values()]
    .toSorted(
      (a, b) =>
        ORDER[a.run.state] - ORDER[b.run.state] ||
        a.run.workflow.localeCompare(b.run.workflow),
    )
    .map(({ run, checks }) => ({ run, checks: checks.toSorted(byState) }))
  if (other.length > 0) {
    groups.push({ run: null, checks: other.toSorted(byState) })
  }
  const states = groups.flatMap((group) =>
    group.checks.map((check) => check.state),
  )
  return {
    sha: head?.commit.oid ?? '',
    summary: summarize(states),
    failing: states.filter(failing).length,
    running: states.includes('pending'),
    cut: rollup?.contexts.pageInfo.hasNextPage ?? false,
    groups,
  }
}

// Whether the page may re-run this run's failed jobs: it has to be one of the PR's runs on its
// head commit, and completed and failed. The run id the page sends is never taken on its own.
export function rerunTarget(
  checks: PullChecks,
  number: number,
  run: number,
): ActionsRun | { refused: string } {
  const found = checks.groups.find((group) => group.run?.id === run)?.run
  if (found == null) {
    return {
      refused: checks.cut
        ? `That run isn't among the first 100 of #${number}'s checks on its latest commit`
        : `That run isn't one of #${number}'s checks on its latest commit`,
    }
  }
  if (!found.rerunnable) {
    return {
      refused: `${found.workflow} #${found.number} hasn't failed, or is still going`,
    }
  }
  return found
}

export const LOG_LINES = 300

const ESC = String.fromCharCode(0x1b)
const COLOUR = new RegExp(`${ESC}\\[[0-9;?]*[A-Za-z]`, 'g')
// The C0 control characters but tab.
const CONTROL = new RegExp(
  `[${String.fromCharCode(0)}-${String.fromCharCode(8)}${String.fromCharCode(0x0a)}-${String.fromCharCode(0x1f)}${String.fromCharCode(0x7f)}]`,
  'g',
)
const STAMP = /^\d{4}-\d\d-\d\dT[\d:.]+Z /
// ##[group], ##[error], ##[command], ##[warning]: the runner's markup, not the job's output.
const MARKER = /^##\[(\w+)\]/
const STEP = '##[group]Run '

// The step the job's last ##[error] line is in, from its ##[group]Run line through that error:
// the end of a job log is the post-job cleanup, not the failure. An error before any step (the
// job's set-up) is cut from the top of the log; without an error line, the end of the log.
export function failedStep(log: string): JobLog {
  const lines = log
    .replace(/^\uFEFF/, '')
    .split('\n')
    .map((line) =>
      line.replace(STAMP, '').replace(COLOUR, '').replace(CONTROL, ''),
    )
  while (lines.length > 0 && lines.at(-1) === '') lines.pop()
  const error = lines.findLastIndex((line) => line.startsWith('##[error]'))
  const start =
    error === -1
      ? 0
      : Math.max(
          0,
          lines.findLastIndex(
            (line, index) => index <= error && line.startsWith(STEP),
          ),
        )
  const step = lines
    .map((line, index): JobLogLine & { marker: string | null } => {
      const marker = MARKER.exec(line)?.[1] ?? null
      return {
        number: index + 1,
        text: marker === null ? line : line.slice(marker.length + 4),
        error: marker === 'error',
        marker,
      }
    })
    .slice(start, error === -1 ? lines.length : error + 1)
    .filter((line) => line.marker !== 'endgroup')
    .map(({ number, text, error: isError }) => ({
      number,
      text,
      error: isError,
    }))
  return {
    failed: error !== -1,
    step:
      error !== -1 && lines[start]?.startsWith(STEP)
        ? lines[start].slice('##[group]'.length)
        : null,
    lines: step.slice(-LOG_LINES),
    cut: step.length > LOG_LINES,
  }
}
