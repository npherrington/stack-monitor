// The shapes the server answers with and the page reads. Imports nothing from Node, so the page
// can import it too.

import type {
  AgentId,
  ServiceInput,
  StackInput,
  WorktreesInput,
} from './config/schema.ts'

// What every action answers: done or refused, what happened, and the log to look at when there is
// one.
export interface ActionResult {
  ok: boolean
  message: string
  log: string | null
}

export function failure(
  message: string,
  log: string | null = null,
): ActionResult {
  return { ok: false, message, log }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export const MODULE_NAMES = [
  'worktrees',
  'stack',
  'agents',
  'featureMap',
] as const
export type ModuleName = (typeof MODULE_NAMES)[number]
export type Modules = Record<ModuleName, boolean>

// A repo's config, as GET /api/repos answers it. source: the config file read, or null when there's none and the defaults apply.
export type ConfigStatus =
  | { ok: true; repo: string; source: string | null; modules: Modules }
  | { ok: false; repo: string; source: string; problem: string }

// A repo the monitor tracks, as GET /api/repos answers it. root is its primary checkout and its id.
// config: its stack-monitor.json as read now; null while the repo can't be read (gone, not git).
export interface RepoStatus {
  root: string
  name: string // what the page calls it: set when added, the folder name by default
  config: ConfigStatus | null
  problem: string | null // why the repo can't be read, or null
}

// A git repo GET /api/repos/scan found under the folder it was given.
export interface ScanHit {
  root: string // its primary checkout
  name: string
  worktrees: number
  tracked: boolean // already in the list
}

export interface ScanResult {
  folder: string // as resolved, ~ expanded
  hits: ScanHit[]
  truncated: boolean // stopped at the time or count limit before looking everywhere
}

export interface Checkout {
  path: string
  primary: boolean
  branch: string | null // null when detached
  head: string // short sha, '' when it can't be read
  changed: number // changed and untracked paths
  ahead: number | null // commits not on mainline; null when mainline doesn't resolve
  behind: number | null
  merged: boolean // on a branch whose commits all reached mainline through a merge
  locked: boolean
  prunable: boolean // git still lists it but its directory is gone
  problem: string | null // why its git state couldn't be read
  services: ServiceState[] // the repo's stack, read in this checkout; empty without one
}

export interface RepoCheckouts {
  root: string
  name: string
  mainline: string
  checkouts: Checkout[] // primary first
  services: string[] // the stack's service names, in declared order; empty without a stack
  problem: string | null // why the repo couldn't be read; checkouts is empty then
}

// GET /api/checkouts: every tracked repo's worktrees, in the order the repos were added.
export interface CheckoutsSnapshot {
  repos: RepoCheckouts[]
}

// How a service reads in one checkout. partial: some of a compose service's parts are up.
// unknown: its status couldn't be read (docker not running, an env file without the port key, a
// command check from a config this machine hasn't trusted).
export type ServiceStateName = 'up' | 'partial' | 'down' | 'unknown'

export interface ServiceState {
  name: string
  state: ServiceStateName
  detail: string | null // what was found or why it's unknown: "port 5173", "1 of 2 containers"
}

// GET /api/repos/stack?root=: the stack in effect for a repo, and where Save writes.
export interface RepoStack {
  root: string
  stack: StackInput | null // null: no stack section in the config in effect
  source: string | null // the config file it came from; null when there's none
  personal: string // the file on this machine POST /api/repos/stack writes
  editable: boolean // false when the config in effect isn't the personal file (Save copies it)
}

// GET /api/repos/detect?root=: services the repo's own files suggest, for the editor to offer.
export interface DetectedService {
  name: string
  from: string // where it was found: "package.json", "mise", "compose.yaml", "Procfile"
  service: ServiceInput
  note: string | null // what to check before trusting the guess, e.g. "port guessed from vite's default"
}

// GET /api/repos/worktrees?root=: how the repo makes worktrees, as its config in effect has it.
export interface RepoWorktrees {
  root: string
  worktrees: WorktreesInput // {} when the config has no worktrees section
  source: string | null
  personal: string // the file on this machine POST /api/repos/worktrees writes
  editable: boolean
}

export type WorktreeCommandRole = 'create' | 'setup' | 'install' | 'teardown'

// GET /api/repos/detect-worktrees?root=: commands the repo's files suggest for each role.
export interface DetectedWorktreeCommand {
  role: WorktreeCommandRole
  command: string // create commands carry {branch}
  from: string // "mise", "package.json", "scripts/", "Makefile", "justfile", "package-lock.json"
  note: string | null // what to check before trusting the guess
}

// ---- Agents: the coding-agent CLIs the monitor launches headless in a checkout ----

export type { AgentId }

// What an adapter's CLI reports, so the page shows only what it has.
export interface AgentCapabilities {
  effort: boolean // takes an effort level
  cost: boolean // reports what a run cost
  resume: boolean // a finished run can be resumed interactively
}

// One CLI on this machine, as GET /api/agents reads it now.
export interface AgentStatus {
  id: AgentId
  label: string // "Claude Code", "OpenCode"
  installed: boolean
  path: string | null // where the program was found (the settings' program override, else PATH)
  version: string | null
  // The CLI keeps its own login; the monitor never holds a key. 'unknown' when it can't be checked.
  login: {
    state: 'yes' | 'no' | 'unknown'
    command: string
    note: string | null
  }
  install: string // how to install it: a command, or a URL
  models: string[] // offered in the run form; any other may be typed
  model: string | null // this machine's default for it, from settings
  can: AgentCapabilities
}

// Ollama, which OpenCode reaches as ollama/<model>: shown so a dev sees their local models.
export interface OllamaStatus {
  running: boolean
  version: string | null
  models: string[]
}

// A run's agent and model: a step of a workflow, the designer, a Run here.
export interface AgentChoice {
  agent: AgentId
  model: string | null // null: the agent's own default
}

// GET /api/agents
export interface AgentsOverview {
  agents: AgentStatus[]
  default: AgentId | null // what Run here starts with; null when none is installed
  // Drafts skills and prompts: the settings' choice, else a free OpenCode model when there is one.
  designer: AgentChoice | null
  ollama: OllamaStatus
}

// POST /api/agents/settings: this machine's agent preferences, kept in the settings file.
export interface AgentSettings {
  default?: AgentId
  designer?: AgentChoice
  agents?: Partial<Record<AgentId, { program?: string; model?: string }>>
}

// What a run may do to the checkout. read: look only. edit: change files. full: anything,
// commands included, without asking.
export type RunPermissions = 'read' | 'edit' | 'full'

export interface RunStepSpec extends AgentChoice {
  prompt: string
  title?: string
}

export type RunKind = 'task' | 'workflow' | 'skill' | 'draft'
export type RunState = 'running' | 'done' | 'failed' | 'stopped'

// POST /api/runs
export interface StartRunRequest {
  checkout: string // a worktree of a tracked repo
  title?: string
  permissions: RunPermissions
  steps: RunStepSpec[] // 1 to 4, run in order in the same checkout; a failed step ends the run
}

export interface StartRunResult extends ActionResult {
  runId: string | null
}

export interface RunSummary {
  id: string
  kind: RunKind
  title: string
  root: string // the repo
  checkout: string
  permissions: RunPermissions
  steps: (AgentChoice & { title: string | null })[]
  step: number // the step running now, or the last one that ran
  state: RunState
  startedAt: string // ISO
  endedAt: string | null
  cost: number | null // USD, summed over steps, when the adapters report it
  report: string | null // the last step's final message
  resume: string | null // the command that resumes the last step's session interactively
}

// A line of an agent's output, as every adapter maps it.
export type RunEvent =
  | { kind: 'text'; step: number; text: string }
  | { kind: 'tool'; step: number; name: string; detail: string | null }
  | { kind: 'report'; step: number; text: string }
  | { kind: 'error'; step: number; text: string }
  | { kind: 'cost'; step: number; usd: number }
  | { kind: 'step'; step: number; state: 'started' | 'finished' | 'failed' }

// GET /api/runs/detail?id=
export interface RunDetail {
  run: RunSummary
  events: RunEvent[]
  stderr: string // the tail of what the CLI wrote to stderr
}

// ---- Skills and workflows: what the Agentic tab builds ----

// A skill in a repo: .agents/skills/<name>/SKILL.md (or .claude/skills/).
export interface SkillInfo {
  name: string
  description: string | null // its frontmatter description
  path: string // relative to the repo root
}

export interface WorkflowStep {
  title: string
  agent: AgentId | null // null: the machine's default agent
  model: string | null
  prompt: string
}

// .agents/workflows/<name>.json in a repo: steps the monitor runs in order in one checkout.
export interface Workflow {
  name: string // lowercase, digits and -, as a service name
  description: string
  permissions: RunPermissions
  steps: WorkflowStep[] // 1 to 4
}

export type ClaudeWorkflowArgument = 'none' | 'ticket' | 'tickets' | 'text'

// .claude/workflows/<name>.js, a Claude Code Workflow script, read from its meta. With a
// <name>.json manifest and an executable <name>.sh beside it, the launcher is what runs.
export interface ClaudeWorkflow {
  name: string
  launcher: boolean // runs .claude/workflows/<name>.sh; else claude runs the script itself
  label: string // the manifest's label, else the name
  description: string
  phases: string[] // the script's meta.phases titles
  cost: string | null // what a run takes, from the manifest
  effort: string | null // the manifest's default effort
  testRun: boolean // the launcher takes --no-publish
  argument: ClaudeWorkflowArgument // what the launcher takes after its options
  argumentLabel: string | null
}

// POST /api/workflows/run-claude
export interface RunClaudeWorkflowRequest {
  checkout: string
  name: string
  testRun?: boolean
  notes?: string // free text every stage reads
  argument?: string // ticket ids split by spaces or commas, or one line of text
  permissions?: RunPermissions // a script's run; a launcher sets its own
}

// GET /api/workflows?root=
export interface WorkflowList {
  workflows: Workflow[]
  claude: ClaudeWorkflow[]
  problems: { file: string; problem: string }[] // files in the folders that didn't parse
}

// What a schedule starts each time it fires: the same three things a person can start by hand.
export type ScheduleTask =
  | {
      kind: 'prompt'
      agent: AgentId
      model: string | null
      prompt: string
      permissions: RunPermissions
    }
  | { kind: 'workflow'; name: string } // .agents/workflows/<name>.json
  | {
      kind: 'claude'
      name: string // .claude/workflows/<name>
      testRun?: boolean
      notes?: string
      argument?: string
      permissions?: RunPermissions
    }

// launchd: a LaunchAgent fires it, the monitor running or not. monitor: the running monitor fires
// it, checking each minute.
export type FireFrom = 'launchd' | 'monitor'

export interface Schedule {
  id: string
  name: string
  cron: string // five fields, local time
  checkout: string // the worktree it runs in
  enabled: boolean
  fireFrom: FireFrom
  task: ScheduleTask
}

// One time a schedule fired, or was due and didn't start a run.
export interface Fire {
  id: string // the schedule's
  at: string // ISO
  by: FireFrom | 'now' // 'now': Run now on the page
  ok: boolean
  runId: string | null
  message: string // why it didn't start, when it didn't
}

// GET /api/schedules
export interface ScheduleView extends Schedule {
  root: string | null // the repo, when the checkout is still a worktree of a tracked one
  next: string[] // the next three fires, ISO
  fires: Fire[] // newest first, the last ten
  problem: string | null // why it won't fire as set: a bad cron line, launchd refusing it
}

// POST /api/schedules/save: no id makes a new one.
export type SaveScheduleRequest = Omit<Schedule, 'id'> & { id?: string }

export interface SaveScheduleResult extends ActionResult {
  id: string | null
  // launchd couldn't read the checkout or the monitor's files: macOS keeps LaunchAgents out of
  // ~/Desktop, ~/Documents and ~/Downloads unless the program has Full Disk Access.
  blocked: { program: string; path: string } | null
}

// A `claude` session the monitor runs in a terminal of its own, for the page's Terminal panel.
// exitCode: null while it runs.
// `claude`, or the user's own shell.
export type TerminalKind = 'claude' | 'shell'

// What a session was started to do, when it was started with a first message: work a board
// ticket, file tickets for a project, or review a PR.
export type SessionTaskKind = 'ticket' | 'product' | 'review'

export interface TerminalSession {
  id: string
  kind: TerminalKind
  root: string // the repo it belongs to
  path: string // the worktree it runs in
  startedAt: string
  exitCode: number | null
  title: string | null // what its tab says when it was started with a task: BEANS-3
  task: SessionTaskKind | null // null for one opened plain
}

// POST /api/board/work, /api/board/product and /api/github/agentic-review
export interface StartedSession extends ActionResult {
  session: TerminalSession | null // null when refused
}

// GET /api/terminals: the sessions, oldest first. POST /api/terminals answers one.
export interface TerminalsSnapshot {
  sessions: TerminalSession[]
}

// ---- GitHub: a repo's open PRs, their diffs and reviews, read through `gh` as its login ----

// GET /api/github?root=: whether the GitHub tab works for a repo, and as whom.
export type GithubStatus =
  | { ok: true; repo: string; url: string; viewer: string } // repo: owner/name
  | { ok: false; problem: string } // gh missing, not logged in, or no GitHub remote

export type ReviewDecision =
  'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null

export interface PullLabel {
  name: string
  color: string | null // six hex digits, no #; null when GitHub's isn't one
}

export interface PullSummary {
  number: number
  title: string
  author: string
  branch: string // the head branch
  base: string
  crossRepository: boolean // the head branch lives in a fork
  draft: boolean
  url: string
  reviewDecision: ReviewDecision
  labels: PullLabel[]
  updatedAt: string // ISO
  additions: number
  deletions: number
  changedFiles: number
}

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
  description: string | null // a check run's title, or a commit status's description
  url: string | null // its page; only http(s)
  startedAt: string | null // null while queued, and for a commit status
  seconds: number | null // from started to completed, once it has completed
  job: number | null // the Actions job id, for GET /api/github/checks/log
}

export interface ActionsRun {
  id: number
  workflow: string
  number: number // the run number GitHub shows: CI #68
  url: string | null // only http(s)
  state: CheckState // the run as a whole, from its check suite
  rerunnable: boolean // completed and failed: POST /api/github/checks/rerun takes it
}

export interface CheckGroup {
  run: ActionsRun | null // null: commit statuses and checks from apps other than Actions
  checks: PullCheck[] // failing first, then pending, cancelled, passing, skipped
}

// GET /api/github/checks?root=&number=: the checks on the PR's head commit, as GitHub has them
// now. A check a later run or attempt superseded is left out, as gh pr checks does.
export interface PullChecks {
  sha: string
  summary: ChecksSummary
  failing: number // checks that failed or were cancelled
  running: boolean // a check is queued or in progress
  cut: boolean // GitHub has more than the first 100 checks on the commit
  groups: CheckGroup[] // Actions runs, failing first; the null group last
}

export interface JobLogLine {
  number: number // its line in the job's log, from 1
  text: string // without its timestamp or colour codes
  error: boolean // a ##[error] line
}

// GET /api/github/checks/log?root=&job=: the failing step of an Actions job's log.
export interface JobLog {
  failed: boolean // the log has a ##[error] line
  step: string | null // the step the last error is in; null before any step, or without an error
  lines: JobLogLine[] // the last 300 of that step, or of the log
  cut: boolean // earlier lines were left out
}

export type DiffSide = 'LEFT' | 'RIGHT' // LEFT: the base's line, RIGHT: the head's

// One line of a file's diff. old/new: its line number on each side, null on the side it isn't on.
export interface DiffLine {
  kind: 'context' | 'add' | 'del'
  old: number | null
  new: number | null
  text: string // without the leading +, - or space
}

export interface DiffHunk {
  header: string // the @@ line
  lines: DiffLine[]
}

export interface PullFile {
  path: string
  previousPath: string | null // set when renamed
  status: string // added, removed, modified, renamed, copied, changed, unchanged
  additions: number
  deletions: number
  hunks: DiffHunk[] | null // null when GitHub sends no patch (binary, or too large)
}

export interface ReviewComment {
  id: string // node id
  author: string
  body: string // markdown
  createdAt: string
  url: string
  pending: boolean // in the viewer's unsubmitted review
  mine: boolean
}

export interface ReviewThread {
  id: string
  path: string
  line: number | null // null when outdated: the line is no longer in the diff
  side: DiffSide
  resolved: boolean
  outdated: boolean
  comments: ReviewComment[] // oldest first
}

export type ReviewState =
  'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED'

export interface PullCommit {
  sha: string
  author: string // their GitHub login, else the commit's author name
  headline: string // the message's first line
  at: string
  url: string
}

// The Conversation tab, oldest first: comments on the PR itself, and each submitted review's
// verdict and summary. Line comments are in threads.
export type TimelineItem =
  | {
      kind: 'comment'
      id: string
      author: string
      bot: boolean // a GitHub App or Actions, whose comments are usually status reports
      body: string
      at: string
      url: string
    }
  | {
      kind: 'review'
      id: string
      author: string
      bot: boolean
      state: ReviewState
      body: string // '' when the review was only line comments
      at: string
      url: string
    }

// GET /api/github/pull?root=&number=
export interface PullDetail extends PullSummary {
  repo: string // owner/name, as gh resolved it
  head: string // the head commit's full sha
  body: string // markdown
  createdAt: string
  viewer: string
  files: PullFile[]
  threads: ReviewThread[]
  timeline: TimelineItem[]
  commits: PullCommit[] // oldest first, the last 100
  pendingReview: string | null // the viewer's unsubmitted review's node id
  pendingComments: number
}

export type ReviewEvent = 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT'

// ---- Ticket board ----

// The colours a project, a column, a label or a ticket can take: the page's swatches (web/lib/swatches.ts).
export const BOARD_COLOURS = [
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'blue',
  'purple',
  'pink',
  'coral',
  'lime',
  'sky',
  'indigo',
  'sand',
  'slate',
] as const
export type BoardColour = (typeof BOARD_COLOURS)[number]

export const PRIORITIES = ['urgent', 'high', 'medium', 'low', 'none'] as const
export type Priority = (typeof PRIORITIES)[number]

export interface BoardProject {
  id: number
  name: string
  prefix: string // BEANS in BEANS-12; unique across projects
  colour: BoardColour | null
  archived: boolean
  tickets: number // on the board
  archivedTickets: number
}

// GET /api/board: unarchived projects first, each group oldest first.
export interface BoardOverview {
  projects: BoardProject[]
}

export interface BoardLabel {
  id: number
  project: number | null // null: shared, usable in every project
  name: string
  colour: BoardColour | null
  uses: number // tickets carrying it in any project, archived ones included
}

export type TicketLabel = Pick<BoardLabel, 'id' | 'name' | 'colour'>

export interface TicketSummary {
  id: number
  number: number
  key: string // BEANS-12: the project's prefix as it is now, and the number
  title: string
  column: number
  priority: Priority
  colour: BoardColour | null // null: a plain card
  dueOn: string | null // YYYY-MM-DD
  overdue: boolean // dueOn is before today on this machine
  labels: TicketLabel[] // by name
  commentCount: number
}

export interface BoardColumn {
  id: number
  name: string
  colour: BoardColour | null
  tickets: TicketSummary[] // top first, unarchived only
}

// GET /api/board/project?id=: labels are the shared ones, then the project's, each by name.
export interface ProjectBoard {
  project: BoardProject
  columns: BoardColumn[] // left to right
  labels: BoardLabel[]
}

export interface TicketComment {
  id: number
  body: string // markdown
  createdAt: string // ISO
  editedAt: string | null
}

// GET /api/board/ticket?project=&number=
export interface TicketDetail extends TicketSummary {
  description: string // markdown
  archived: boolean
  createdAt: string
  comments: TicketComment[] // oldest first
}

export interface ArchivedTicket extends TicketSummary {
  archivedAt: string
  columnName: string // where Restore puts it
}

// GET /api/board/archived?project=: most recently archived first.
export interface ArchivedTickets {
  tickets: ArchivedTicket[]
}

// POST /api/board/projects/save
export interface SaveProjectResult extends ActionResult {
  id: number | null
}

// POST /api/board/tickets/create
export interface CreateTicketResult extends ActionResult {
  number: number | null
}
