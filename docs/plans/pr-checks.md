# Feature: PR checks

## Overview

The GitHub page lists a repo's open PRs and lets you review one, but it never shows CI. This adds
the checks on each PR's head commit: a badge on every row of the list, a Checks tab in the PR view
with each check run and commit status, the failed step's log for a failed Actions job when you ask
for it, and a button that re-runs a failed Actions run's failed jobs.

Weight: Full (new routes, and a route that runs an outward `gh` command that spends CI minutes).
Everything stays in the existing GitHub module: `core/github/`, `server/routes.ts`,
`web/components/github/`. No config change, no new dependency.

## Requirements

- Each row in the PR list shows a checks badge: passing, failing or pending. A PR with no checks
  shows none, as a PR with no review decision shows no decision pill today.
- The PR view gets a Checks tab (`&tab=checks`) listing every check on the head commit: its state,
  its name, the workflow it belongs to, how long it took, and a link to it on GitHub. Actions jobs
  sit under their workflow run; commit statuses and other apps' checks sit in their own group.
- A failed Actions job offers "Failed log". The log is read only when that's clicked, never with
  the PR or the checks.
- A failed Actions run offers "Re-run failed jobs" only when GitHub reports the run completed and
  failed. The server reads the run again and refuses otherwise. The result is one toast.
- Every read asks GitHub again. The server keeps nothing (PLAN.md § Principles, "Reads, doesn't
  remember").
- The token's scopes (`repo`, `read:org`, `gist`, `admin:public_key`, no `workflow`) are enough:
  - The job log read was checked against this repo with this token.
  - Per GitHub's REST docs, `rerun-failed-jobs` needs `repo`. `workflow` is only for writing files
    under `.github/workflows/`. See Open questions for confirming this on a real run.

## Technical Approach

**What the list reads.** `gh pr list --json` gains `statusCheckRollup`. gh answers each PR's head
commit contexts as a flat array (checked on this repo):
`{ __typename: 'CheckRun', name, status, conclusion, startedAt, completedAt, detailsUrl, workflowName }`
or `{ __typename: 'StatusContext', context, state, targetUrl, startedAt }`. The server cuts each
PR's array down to one `ChecksSummary`, so the page gets one word per PR rather than 200 arrays.
The gh-to-GitHub payload grows by about 300 bytes per check per PR, once a minute. That's small at
this repo's size. A repo with many checks on many PRs could swap to a GraphQL query for
`statusCheckRollup { state }` (Open questions).

**What the PR view reads.** A new `GET /api/github/checks?root=&number=` makes one GraphQL call
for the head commit's `statusCheckRollup.contexts(first: 100)`. Each `CheckRun` comes with its
`databaseId` (the Actions job id) and its `checkSuite { status conclusion app { slug } workflowRun
{ databaseId runNumber url workflow { name } } }`. These fields were checked against PR #21. Checks
get their own route and poll, apart from `GET /api/github/pull`:

- They change on CI's clock, not the reviewers'.
- Polling them every 10 s inside `readPull` would also re-read the files and timeline every 10 s.
- A re-run then refreshes only the checks.

The lighter option, putting the checks in `PullDetail`, is under Open questions.

**One mapping, two sources.** `checkState()` in a new pure file `core/github/checks.ts` turns
either source's fields into a `CheckState`. `summarize()` turns a list of states into the
summary. The list and the Checks tab therefore can't disagree. The file sits beside
`core/github/patch.ts` and has the same role: pure functions that `github.ts` calls, tested on
their own. The table follows `gh pr checks`' buckets:

| GitHub says                                                           | `CheckState` |
| --------------------------------------------------------------------- | ------------ |
| `SUCCESS`                                                             | `pass`       |
| `FAILURE`, `ERROR`, `TIMED_OUT`, `ACTION_REQUIRED`, `STARTUP_FAILURE` | `fail`       |
| `CANCELLED`                                                           | `cancelled`  |
| `SKIPPED`, `NEUTRAL`                                                  | `skipped`    |
| anything else (a status not `COMPLETED`, `PENDING`, `EXPECTED`, …)    | `pending`    |

A `CheckRun` is read by its `conclusion` once `status` is `COMPLETED`, and by `status` before
that. A `StatusContext` is read by its `state`. `summarize` checks in this order:

- any `fail` or `cancelled` → `failing`
- else any `pending` → `pending`
- else any check at all → `passing` (skipped-only included)
- else → `none`

**The failed log.** `GET /api/github/checks/log?root=&job=` runs
`gh api --allow-escape-sequences repos/{repo}/actions/jobs/{job}/logs`, which is one job's
plain-text log. Two findings from trying it on this repo:

- Without `--allow-escape-sequences`, gh 2.102 exits 1 with "the response contains terminal escape
  sequences", even when stdout is a pipe. With the flag, the colour codes arrive as they are, so the
  server strips them.
- The end of a job log is the checkout action's post-job cleanup, not the failure. On failed job
  139571610360, the `Test` step runs from line 215 (`##[group]Run mise run test`) to line 564
  (`##[error]Process completed with exit code 1.`), and two `Post job cleanup.` lines follow.

So `failedStep()` cuts the log from the last `##[group]Run ` line before the last `##[error]` line,
through that `##[error]` line. It keeps the last 300 lines of that cut, drops each line's timestamp
prefix and colour codes, and flags the `##[error]` lines. A log with no `##[error]` line answers
its last 300 lines with `step: null`.

`gh run view --job <id> --log-failed` does that slicing itself, but it downloads the whole run's
log archive to show one job (Open questions).

**Re-run, and how it's gated.** `POST /api/github/checks/rerun { root, number, run }` does three
things in order:

1. Reads the PR's checks again with the same function the read route uses.
2. Refuses unless `run` is one of the head commit's Actions runs, and its check suite is
   `COMPLETED` with conclusion `FAILURE` or `TIMED_OUT`.
3. Runs `gh api --method POST repos/{repo}/actions/runs/{run}/rerun-failed-jobs`.

That is the PLAN.md § Principles line "Refuses what it can't check": a run id the page sends is
never trusted on its own. The page shows the button only when the run's `rerunnable` is true,
which the server works out ("Derive, don't store", `react-hooks.md`), and disables it while the
request is out. The answer is an `ActionResult`, and the toast says which jobs of which run:
"Re-running 2 failed jobs of CI #68". `gh api` with the repo's own `owner/name` path is used
rather than `gh run rerun --failed`, so the repo is the one `githubRepo()` already resolved, as
`readFiles` does. Both call the same endpoint.

**Polling.** `usePullChecks` polls every 10 s while any check is `pending` and every 60 s once all
have settled. It stops on an error, like `usePull` and `usePulls`
(`react-data-fetching.md` § Polling; `docs/decisions/data-tanstack-query.md`, "stops or slows when
the data says nothing is changing"). A re-run invalidates the checks key, so the next read shows
the jobs pending and the 10 s interval takes over. The list keeps its 60 s interval. The log query
has no interval: a finished job's log doesn't change, and a re-run makes new job ids.

**MCP.** There's no `mcp/` directory yet. A read-only `stack_pull_checks` tool calling
`readChecks` would belong there once it exists ("The MCP server reads status"). Re-run never goes
there, because it spends CI minutes ("Runs that spend money start from the page"). Out of scope
here.

## Implementation Sections

### Section 1: Types (`core/types.ts`)

**Files to modify/create:**

- `core/types.ts`: the check types; `PullList.pulls` becomes `ListedPull[]`.

`PullDetail extends PullSummary`, and `readPull` doesn't read checks, so the summary goes on a
list-only type rather than on `PullSummary`.

**Type definitions:**

```typescript
export type CheckState = 'pass' | 'fail' | 'pending' | 'skipped' | 'cancelled'

// The head commit's checks in one word; none: no check or status reported on it.
export type ChecksSummary = 'passing' | 'failing' | 'pending' | 'none'

export interface ListedPull extends PullSummary {
  checks: ChecksSummary
}

// GET /api/github/pulls?root=: every open PR, most recently updated first.
export interface PullList {
  repo: string
  viewer: string
  pulls: ListedPull[]
}

export interface PullCheck {
  name: string // the job's name, or a commit status's context
  state: CheckState
  description: string | null // a commit status's description, or a check run's title
  url: string | null // its page on GitHub
  startedAt: string | null // ISO; null while queued
  seconds: number | null // from started to completed, once it has completed
  job: number | null // the Actions job id, for GET /api/github/checks/log; null for any other check
}

export interface ActionsRun {
  id: number
  workflow: string
  number: number // the run number GitHub shows: CI #68
  url: string
  state: CheckState // the run as a whole, from its check suite
  rerunnable: boolean // completed and failed: POST /api/github/checks/rerun takes it
}

export interface CheckGroup {
  run: ActionsRun | null // null: commit statuses and checks from apps other than Actions
  checks: PullCheck[] // failing first, then pending, cancelled, passing, skipped
}

// GET /api/github/checks?root=&number=: the checks on the PR's head commit, as GitHub has them now.
export interface PullChecks {
  sha: string
  summary: ChecksSummary
  groups: CheckGroup[] // Actions runs failing first, the null group last
}

export interface JobLogLine {
  text: string // without its timestamp or colour codes
  error: boolean // a ##[error] line
}

// GET /api/github/checks/log?root=&job=: the end of a failed Actions job's log.
export interface JobLog {
  step: string | null // the step the last error is in; null when the log names none
  lines: JobLogLine[] // the last 300 of that step
  cut: boolean // earlier lines of the step were left out
}
```

**Tests:** None: no new rule.

### Section 2: The mapping (`core/github/checks.ts`, new)

**Files to modify/create:**

- `core/github/checks.ts`: pure functions and the zod schemas for the two rollup shapes. It
  imports `zod` and `core/types.ts` only, as `patch.ts` does.

**Code changes:**

```typescript
export const ListRollup = z
  .array(
    z.union([
      z.object({
        __typename: z.literal('CheckRun'),
        status: z.string(),
        conclusion: z.string().nullable(),
      }),
      z.object({ __typename: z.literal('StatusContext'), state: z.string() }),
    ]),
  )
  .nullable()

export const HeadRollup = z.object({
  /* the GraphQL contexts, CheckRun | StatusContext on __typename */
})

export function checkState(
  given: { status: string; conclusion: string | null } | { state: string },
): CheckState

export function summarize(states: CheckState[]): ChecksSummary

// Groups Actions jobs under their run and puts everything else in one group, ordered as in
// CheckGroup. seconds and rerunnable are worked out here.
export function checkGroups(
  contexts: z.output<typeof HeadRollup>['nodes'],
): CheckGroup[]

export function failedStep(log: string): JobLog
```

Notes for the implementer:

- `ListRollup` takes `null` as well as `[]`, so a PR whose head commit has no rollup parses.
  `listPulls` maps it to `none`.
- A `CheckRun` counts as an Actions job when `checkSuite.app.slug === 'github-actions'` and
  `checkSuite.workflowRun` isn't null. Its `databaseId` is the job id: on PR #21, `140456415874`
  is both the check run's id and the `/job/140456415874` in its URL.
- `rerunnable` is the suite's `status === 'COMPLETED'` and `conclusion` in `FAILURE`, `TIMED_OUT`.
- The colour codes: eslint's `no-control-regex` flags a literal ESC in a regex. Build it from
  `String.fromCharCode(0x1b)` and drop the other C0 control characters except tab, and strip a
  leading BOM. The timestamp prefix is `/^\d{4}-\d\d-\d\dT[\d:.]+Z /`. Drop `##[endgroup]` lines,
  and `##[group]` and `##[error]` lose their marker.

**Tests:** new `tests/github-checks.test.ts`, beside `tests/github-patch.test.ts`:

- `checkState maps every status, conclusion and commit state`: one table looped over.
- `summarize puts failing before pending before passing, and an empty list is none`: one table
  looped over, with skipped-only reading passing.
- `the list rollup parses gh's answer, and a missing one reads as none`: gh's array (trimmed from
  this repo's `gh pr list --json statusCheckRollup`) and `null`.
- `checkGroups puts jobs under their run, and statuses and other apps' checks apart`: on
  `tests/data/github-checks.json`, a recorded GraphQL answer edited to hold a failed run, a running
  run, a commit status and a non-Actions check run. Asserts the grouping, the order and `seconds`.
- `only a run that completed and failed is rerunnable`: on the same recording (the failed run yes,
  the running one and a cancelled one no).
- `failedStep cuts the failing step out of the job log`: on `tests/data/actions-job-failed.log`,
  job 139571610360's log trimmed to about 60 lines with the post-job cleanup kept. Asserts the step
  name, that the cleanup is gone, no timestamps or ESC left, and the last line flagged `error`.
- `failedStep keeps the last 300 lines, and a log without an error has no step`: generated lines.

### Section 3: Core reads and the re-run (`core/github/github.ts`)

**Files to modify/create:**

- `core/github/github.ts`: the list field, the three functions, the request schemas.

**Code changes:**

```typescript
const ActionsId = z.coerce
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER)

export const ChecksRequest = PullRequest
export const JobLogRequest = z.object({ root: PathText, job: ActionsId })
export const RerunRequest = z.strictObject({
  root: PathText,
  number: PullNumber,
  run: ActionsId,
})

export function readChecks(
  tracking: Tracking,
  given: string,
  number: number,
): Promise<PullChecks | { problem: string } | { refused: string }>

export function readJobLog(
  tracking: Tracking,
  given: string,
  job: number,
): Promise<JobLog | { problem: string } | { refused: string }>

export function rerunFailedJobs(
  tracking: Tracking,
  request: z.output<typeof RerunRequest>,
): Promise<ActionResult>
```

- **List**: `SUMMARY_FIELDS` gains `statusCheckRollup`. A list-only
  `GhListedPull = GhPull.extend({ statusCheckRollup: ListRollup })` keeps `GhDetail` (which extends
  `GhPull`) as it is. Each row is `{ ...summary(pull), checks: summarize(...) }`.
- **`readChecks`**: `githubRepo`, then a private `headChecks(repo, number)` that runs
  `CHECKS_QUERY` through `graphql()` with `ownerName(repo)` and `{ number }`, then
  `checkGroups`. A `problem` from gh answers as `{ refused }`, as `readPull` does.
- **`readJobLog`**: `gh(repo.root, ['api', '--allow-escape-sequences', `repos/${repo.repo}/actions/jobs/${job}/logs`])`
  then `failedStep(stdout)`.
  - A gh failure answers `{ refused: problem }`: GitHub's 404 or 410 for an expired log, in gh's
    own words.
  - A log over `run`'s 16 MB buffer comes back as code -1 and reads as a refusal. Say "The log is
    too long to read here; open it on GitHub" instead of the buffer error.
- **`rerunFailedJobs`**: inside `action()`:

```typescript
const checks = await headChecks(repo, request.number)
if ('problem' in checks) {
  return failure(`Couldn't read #${request.number}'s checks: ${checks.problem}`)
}
const group = checks.find((each) => each.run?.id === request.run)
if (group?.run == null) {
  return failure(
    `That run isn't one of #${request.number}'s checks on its latest commit`,
  )
}
if (!group.run.rerunnable) {
  return failure(
    `${group.run.workflow} #${group.run.number} hasn't failed, or is still going`,
  )
}
const failed = group.checks.filter(
  (check) => check.state === 'fail' || check.state === 'cancelled',
)
const answer = await gh(repo.root, [
  'api',
  '--method',
  'POST',
  `repos/${repo.repo}/actions/runs/${group.run.id}/rerun-failed-jobs`,
])
return done(
  answer,
  `Re-running ${failed.length} failed ${failed.length === 1 ? 'job' : 'jobs'} of ${group.run.workflow} #${group.run.number}`,
  "Couldn't re-run the failed jobs",
)
```

`done()` already reads `{ ok: false, problem }` as a failure and anything else as done. GitHub's
own refusals (no write access, a run over 30 days old) come back in gh's words.

**Tests:**

- The mapping is Section 2's tests. What's left here is `gh` talking to the network. The existing
  github code has no test of that either: `github-patch.test.ts` tests the pure parser, and
  `routes.test.ts` tests the refusals that come before any gh call. This follows the same split. A
  fake `gh` on `PATH` (as `tests/agent-fakes.ts` fakes the agent CLIs) would be new test
  infrastructure for this module (Open questions).

### Section 4: Routes (`server/routes.ts`)

**Files to modify/create:**

- `server/routes.ts`: three entries beside the GitHub routes, importing from
  `core/github/github.ts`.

**Code changes:**

```typescript
'GET /api/github/checks': route(ChecksRequest, '?root=&number=', async ({ root, number }) => {
  const checks = await readChecks(tracking, root, number)
  return 'groups' in checks ? [200, checks] : notRead(checks)
}),
'GET /api/github/checks/log': route(JobLogRequest, '?root=&job=', async ({ root, job }) => {
  const log = await readJobLog(tracking, root, job)
  return 'lines' in log ? [200, log] : notRead(log)
}),
'POST /api/github/checks/rerun': route(RerunRequest, '{ root, number, run }', async (body) =>
  settled(await rerunFailedJobs(tracking, body)),
),
```

All three go through `route()`, so the Host, Origin, JSON body and `MAX_BODY_BYTES` checks in
`server/http.ts` hold unchanged.

**Tests:** extend `the GitHub routes refuse a repo that is not tracked, and a review GitHub has no
event for` in `tests/routes.test.ts`:

- `/api/github/checks?root=…&number=1` and `/api/github/checks/log?root=…&job=1` join its 409
  loop.
- `POST /api/github/checks/rerun` for the untracked root answers 409 `isn't in the list`.
- `run: 0` answers 400 `Expected .*: run: `.

None of these reach gh.

### Section 5: Links and hooks (`web/lib/`, `web/hooks/`)

**Files to modify/create:**

- `web/lib/github-links.ts`:
  - `PullTab` becomes `'conversation' | 'files' | 'checks'`.
  - `pullPath` adds `&tab=${tab}` for any tab but conversation.
  - `readPullTab` accepts `'checks'`.
- `web/hooks/use-pull-checks.ts` (new): `pullChecksKey(root, number)` under `githubKey`, as
  `pullKey` is. Returns `{ checks, isPending, error, isStale }`, memoised, the same shape as
  `usePull`.
- `web/hooks/use-job-log.ts` (new): `useJobLog(root, job)`, key
  `[...githubKey, 'job-log', root, job]`, `staleTime: Infinity` and no interval. The component
  that calls it mounts only when the log is opened, so the read happens on that click.
- `web/hooks/use-check-mutations.ts` (new): `useCheckMutations(root, number)` returning
  `{ rerunFailed, isRerunning }`. On success it raises
  `toast.add({ type: 'success', title: 'Failed jobs re-running', description: result.message })`.
  On error it calls `toastFailure("Couldn't re-run the failed jobs", failure)`. In `onSettled` it
  invalidates `pullChecksKey(root, number)` and `pullsKey(root)`.

**Code changes:**

```typescript
// Every 10 s while a check is still going, once a minute after; a refusal stops it until focus.
const RUNNING_MS = 10_000
const SETTLED_MS = 60_000

refetchInterval: (query) =>
  query.state.status === 'error'
    ? false
    : query.state.data?.groups.some((group) =>
          group.checks.some((check) => check.state === 'pending'),
        )
      ? RUNNING_MS
      : SETTLED_MS,
```

**Tests:** None: no automated suite for `web/`. The gate is `mise run lint && mise run build`. The
routes these hooks call are covered in Section 4.

### Section 6: The page (`web/components/github/`)

**Files to modify/create:**

- `web/components/github/checks-pill.tsx` (new): `ChecksPill({ summary })`. A `Record` over
  `Exclude<ChecksSummary, 'none'>` gives each summary its label and `Pill` tone, as `DECISION` does
  in `pull-list.tsx`:
  - passing → "Checks passing" (`good`)
  - failing → "Checks failing" (`problem`)
  - pending → "Checks running" (`attention`)

  It renders nothing for `none`. Mapping domain values to variants happens in the feature
  component (`react-components.md` § Map domain values to variants). It is used by two files, so
  it gets its own file.

- `web/components/github/pull-list.tsx`: `<ChecksPill summary={pull.checks} />` after the decision
  pill in each row.
- `web/components/github/pull-view.tsx`:
  - Calls `usePullChecks(root, number)`. A third `Segmented` option is labelled "Checks", or
    "Checks (2 failing)" / "Checks (running)" once read.
  - Puts `ChecksPill` in the meta row beside Draft.
  - Renders `<Checks root={root} number={number} />` for `tab === 'checks'`.
- `web/components/github/checks.tsx` (new): `Checks`, the tab. It calls `usePullChecks` (the same
  cache entry as the view's) and `useCheckMutations`. For each group it renders a `Card`:
  - The header: the workflow and run number linking to the run, the run's state pill, and
    "Re-run failed jobs" when `run.rerunnable` (disabled while `isRerunning`).
  - One row per check: a state pill with its word, the name, `description` muted, the duration
    from `seconds` ("1m 23s", a private helper; "running" or "queued" while pending), and "Details"
    linking to `url` (`target="_blank" rel="noopener noreferrer"`, as the other links out do).
  - A failed check with a `job` gets a "Failed log" toggle that mounts `CheckLog` under the row.
- `web/components/github/check-log.tsx` (new): `CheckLog({ root, job, url })` calls `useJobLog`.
  It shows the step name, then a `<pre>` with a max height that scrolls, scrolled to the bottom,
  one text child per line. `error` lines are in `text-destructive`. When `cut`, it says "Earlier
  lines are on GitHub", with the link.

**UI states** (`react-components.md` § Rendering, every data-driven region has three):

| Region                    | Loading                                  | Failure (no data)                                         | Empty                                                                                  | Stale                                                                       |
| ------------------------- | ---------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| List badge                | none (comes with the list)               | the list's own error                                      | `none`: no pill                                                                        | the list's "Couldn't refresh; showing the last read"                        |
| Tab label and header pill | label "Checks", no pill                  | label "Checks", no pill                                   | label "Checks"                                                                         | the last read's                                                             |
| Checks tab                | `Skeleton` the height of two cards       | `role="alert"` with the server's message (gh's own words) | "No checks reported on {sha7}." Checks show here once CI or a status reports on the PR | "Couldn't refresh; showing the last read" (`text-warning`, `role="status"`) |
| Failed log                | `Skeleton` in the log's place            | `role="alert"` with the message, and the GitHub link      | "The log has no error line" plus the GitHub link                                       | n/a (no interval)                                                           |
| Re-run                    | button disabled while the request is out | `toastFailure` with the server's reason                   | button absent unless `rerunnable`                                                      | n/a                                                                         |

None of the queries raise a toast (`react-toasts.md` § Toasts Answer Actions, Not Queries). Log
lines, check names and descriptions are written by CI, so they render as text children
(`react-components.md` § Rendering, "Text from the machine renders as a text child").

**Tests:** None: no automated suite for `web/`. Look at it running:

1. `mise run dev` (in a linked worktree, `STACK_MONITOR_PORT=7430`), and open the GitHub tab on
   this repo.
2. The list shows "Checks passing" on a PR with green CI, and no pill on a PR without checks.
3. Open `#/github?repo=…&pr=21&tab=checks`: one CI #68 card, four jobs with durations, Details
   links to their job pages, no Re-run button. The tab label reads "Checks", and a reload keeps
   the tab.
4. A PR whose run failed (`gh run list --status failure --json headBranch`): "Failed log" shows
   the failing step ending in its `##[error]` line, with no post-job cleanup and no colour-code
   junk. A second open of the same log makes no new request (network panel).
5. Re-run is clicked once only, on this feature's own draft PR after a deliberately failed run,
   with the user's go-ahead, because it spends CI minutes. The toast says which jobs, the jobs go
   pending, and the tab polls every 10 s until they settle.
6. Stop the monitor while on the Checks tab: the stale note shows and no toast fires.

## Config & Contract

- **Config**: none. No `stack-monitor.json` change, so `mise run schema` and
  `examples/node-postgres.json` are untouched.
- **Changed answer**: `GET /api/github/pulls` gains `checks` on every PR (`ListedPull`). This is
  additive. Its one reader is `pull-list.tsx`. `PullSummary` and `PullDetail` don't change.
- **New routes**:
  - `GET /api/github/checks` (read by `use-pull-checks.ts`)
  - `GET /api/github/checks/log` (read by `use-job-log.ts`)
  - `POST /api/github/checks/rerun` (sent by `use-check-mutations.ts`)

  No MCP tool reads them yet (no `mcp/`).

- **A command it starts running**:
  - `gh api … /logs` is a read. It answers to "Reads, doesn't remember": nothing is kept
    server-side. The page holds a finished job's log in its query cache for the session.
  - `gh api --method POST … /rerun-failed-jobs` is outward and spends CI minutes. It answers to
    "Refuses what it can't check": the server re-reads the PR's checks and refuses a run that
    isn't on the head commit, or isn't completed and failed. It also answers to "Runs that spend
    money start from the page": no MCP tool.
- **Local only**: all three routes go through `route()` with the existing checks.

## Verification Checklist

- [ ] Every list row shows passing, failing or running, and nothing for a PR without checks
- [ ] The Checks tab lists each check with its state, name, workflow, duration and GitHub link,
      and `&tab=checks` survives a reload
- [ ] A failed Actions job's log loads only on "Failed log", and shows the failing step's tail
- [ ] "Re-run failed jobs" shows only for a completed, failed run; the server refuses any other run
      id; the toast names the run and the number of jobs
- [ ] The checks poll every 10 s while one is pending and every 60 s after, and stop on a refusal
- [ ] No toast from any query; the stale note on a failed refresh
- [ ] `mise run check` passes
- [ ] No regressions: Conversation and Files changed tabs, review actions, checkout rows' PR links
      (`repo-section.tsx` calls `pullPath` with the default tab)

## Open questions

- **A third tab, or inside Conversation?** Recommended: a third tab, "Checks".
  - Conversation is already three columns (discussion, commits, files), and an opened log needs
    the full width.
  - github.com has a Checks tab, so people look for one.
  - `PullTab` and the URL already carry a tab.

  The header pill and the tab label keep the state in sight from the other tabs.

- **A separate checks route, or checks inside `PullDetail`?** Recommended: the separate route.
  Folding them into `readPull`'s GraphQL query is lighter: no new read route or hook. But either
  `usePull` would re-read the files and timeline every 10 s while CI runs, or the checks would
  refresh only every 30 s. A re-run would also refresh the whole PR.
- **The list's rollup: `gh pr list --json statusCheckRollup`, or a GraphQL query?** Recommended:
  `gh pr list`, a one-word change to `SUMMARY_FIELDS`, cut to a summary on the server. A GraphQL
  query asking only `statusCheckRollup { state }` sends less, but it means replacing `gh pr list`
  and its pagination. Worth it only if a repo's list read gets slow.
- **Log source: the jobs API or `gh run view --job <id> --log-failed`?** Recommended: the jobs API
  plus `failedStep()`.
  - The API reads one job's text, and works as soon as that job completes.
  - `--log-failed` slices the failed steps itself: 350 lines for job 139571610360, prefixed
    `job⇥step⇥timestamp`. But it downloads the run's whole log archive, and gh refuses logs while
    the run is still in progress (to confirm).
  - Both need the colour codes stripped.
- **Cancelled runs.** Recommended:
  - A cancelled check counts as failing in the summary, since it blocks a required check as a
    failure does.
  - "Re-run failed jobs" is not offered for a cancelled run. You asked for "completed and failed",
    so it's `FAILURE` and `TIMED_OUT` only, though GitHub's endpoint would accept a cancelled run.
- **A confirm dialog before re-running?** Recommended: no.
  - The button says what it does and appears only for a failed run.
  - The server re-checks, and the toast confirms which jobs.
  - `AlertDialog` is for destructive actions (`react-components.md` § Accessibility), and a
    re-run destroys nothing.
- **Scopes.** The log read works with this token (checked on this public repo; a private repo
  needs `repo`, which the token has). Re-run needs `repo` per GitHub's REST docs and was not tried,
  since it spends CI minutes. Recommended: confirm it on step 5 of Section 6. A 403 would come back
  in gh's own words in the failure toast.
- **Testing the gh calls.** Recommended: pure functions on recorded data, plus the route refusals,
  as the module does today. The heavier option is a fake `gh` script on `PATH` printing recorded
  answers, as `tests/agent-fakes.ts` does for the agent CLIs. It would test `rerunFailedJobs`'s
  refusals end to end, but it's new infrastructure for the whole GitHub module and belongs in its
  own change.
- **The page caching a finished log (`staleTime: Infinity`).** Recommended: yes. The cache lives
  in the browser tab and is gone on reload, and a finished job's log can't change. Without it, a
  focus refetch re-downloads a log that may run to megabytes.

## Style Guide Suggestions

- **`toastFailure`'s arguments**: `react-toasts.md` § Raising One shows `toastFailure(error, title)`.
  `web/lib/toast-failure.ts` on main is `toastFailure(title, failure)`. Update the guide to the
  code. This plan follows the code.
- **A success toast's title**: the guide says the title is what happened and the description is to
  what. `use-review-mutations.ts`'s `success` puts the server's message in the title with no
  description. This plan follows the guide (Section 5). Settle one in the guide.
- **Stale "nothing exists yet" lines**: `react-data-fetching.md` § Polling and § Mutations and
  `react-toasts.md` say no poll, mutation or toast exists yet. `use-pull.ts`,
  `use-review-mutations.ts` and `toast-failure.ts` are now the examples.
- **`staleTime` for a read that can't change** isn't covered by `react-data-fetching.md`. Add a
  line: immutable reads (a finished job's log) set `staleTime: Infinity`, and nothing else does.
- **Core's refusal shapes**: `core/github/github.ts` answers reads as
  `T | { problem } | { refused }` (500 vs 409 through `notRead`) and actions through
  `action()`/`done()`. There's no guide for `core/` yet; this is the first pattern worth writing
  down when one starts.
