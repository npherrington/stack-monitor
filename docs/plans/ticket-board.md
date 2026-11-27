# Feature: Ticket board

## Overview

A new sidebar group, "Product management", with one page, "Ticket board": projects, each its own
board of tickets in columns, with labels, priorities, due dates and comments, in the manner of
Linear's board. It is the first thing the monitor keeps that a person wrote rather than something
read off the machine, so it comes with a decision record and PLAN.md edits. Tickets stand alone in
v1: nothing links one to a repo, worktree, run or PR.

## Requirements

- **Sidebar and route.** A "Product management" group with "Ticket board", at `/#/board`.
- **Storage.** One SQLite file through `node:sqlite`, at `~/.local/state/stack-monitor/board.db`,
  or the file `$STACK_MONITOR_BOARD` names. No npm dependency, no config section, no MCP tool.
- **Projects.** Each is a board. Name, prefix, colour. Create, edit, archive, restore, and delete
  with every ticket after an AlertDialog that says how many.
- **Prefix and ids.** The user picks the prefix (default: derived from the name). Unique across
  all projects, archived ones included. Tickets are numbered per project from 1; a number is never
  given out twice. The id shown is `<prefix>-<number>`, computed on read, so renaming the prefix
  renames every id and keeps the numbers.
- **Columns.** A new project gets Backlog, Todo, In progress, In review, Done, Cancelled. Add,
  rename, recolour, reorder, delete. No column type. Deleting one that has tickets asks which
  column takes them; the last column can't be deleted.
- **Labels.** Shared (every project) or belonging to one project. Name and colour.
- **Colours.** One of the 14 swatches (`web/lib/swatches.ts`) or none, for projects, columns and
  labels.
- **Tickets.** Title, markdown description, column, labels, priority (urgent, high, medium, low,
  none), optional due date, comments (markdown; add, edit, delete). A ticket whose due date has
  passed shows as overdue in any column. A ticket stays in its project.
- **Order.** Manual within a column. A new or restored ticket lands at the top. Drag a card within
  its column or to another (native HTML5 drag and drop); each card's menu has Move to column, Move
  up and Move down for the keyboard.
- **Archive and delete.** A ticket can be archived (off the board, listed in an archived view,
  restorable) or deleted with its comments after an AlertDialog.
- **Finding.** On the board: filter by label, filter by priority, search by title or id.
- **Ticket dialog.** Opens from `/#/board?project=<id>&ticket=<number>`, so it deep-links and Back
  closes it.
- **Two tabs.** Last save wins; the other tab catches up on the refetch at window focus. No
  polling.
- **Implicit.** Every data region has loading, error and empty states. Ticket text renders through
  react-markdown only. An unreadable or newer file shows its problem on the page. Tests use a real
  SQLite file in a temp directory.
- **Out of scope.** Estimates, sub-tickets, a list view, moving tickets between projects,
  assignees, links to repos, worktrees, runs or PRs, MCP tools, import and export.

## Technical Approach

**Logic in `core/board/`, thin routes, one page.** The same layering as Schedules:
`core/board/*.ts` holds every rule, `server/routes.ts` gains entries that validate a body and call
in, `core/types.ts` gains the answer shapes, and the page reads them through hooks.

**The file is opened per call.** Each core function opens the file, checks its version, does its
work and closes it. Measured on this machine: open, two reads and close take about 0.1 ms. That
keeps "every read looks at the machine again" true for the board, leaves nothing to close when the
monitor stops, lets the page recover as soon as a broken file is fixed, and means `makeRoutes`
opens nothing: the existing route tests, which never call a board route, never touch the real
file. Options at open: `{ timeout: 2000 }`, so a second monitor writing at the same moment waits
instead of failing. Foreign keys are on by default in `node:sqlite`. The journal mode stays
SQLite's default, so no `-wal` file sits beside the database.

**Versioned with `PRAGMA user_version`.** `MIGRATIONS[n]` takes a file from version `n` to
`n + 1`. `openBoard` reads the version; when it is behind, it takes the write lock
(`BEGIN IMMEDIATE`), reads the version again (another process may have migrated meanwhile), runs
the missing steps and sets `user_version`, all in that one transaction. Three things answer
`{ problem }` instead of a database, and leave the file as it was: the file isn't SQLite (SQLite
says so on the first read, not at open), its version is above `SCHEMA_VERSION` ("written by a newer
stack monitor"), or it can't be opened. A read route answers a problem as 500 with
`failure(problem)` (`unlisted` in `server/routes.ts`), and the page shows the message where the
board would be, as Schedules does. A write answers it as a refusal, 409, as `saveSchedule` does
with its store's problem.

**Ids are never reused.** Every table's id is `INTEGER PRIMARY KEY AUTOINCREMENT`, so a stale tab
acting on a deleted row gets "There's no ticket…" and never a different row. A ticket's number
comes from `project.next_number`, read and bumped in the transaction that inserts the ticket; the
counter only goes up, so deleting BEANS-3 never frees 3.

**Order is a `position` integer per ticket, sorted ascending.**

- A new or restored ticket takes `min(position) - 1` of its column's unarchived tickets: the top,
  with no other row rewritten.
- A move rewrites the target column: its unarchived ids in order, without the moved ticket, with
  the ticket spliced in at the place asked for, written back as `0..n-1` (only rows whose position
  changed). The column it left keeps its gaps.
- The place is relative, not an index: `{ column, beside, place }`, where `beside` is a ticket id
  in that column and `place` is `before` or `after`; `beside: null` is the top. A relative place
  stays right while filters hide cards and when another tab has changed the column. An anchor that
  is no longer in that column is refused, and the page's refetch shows why.
- Columns have a `position` too, rewritten `0..n-1` on reorder; a new column goes last.

**SQL is fixed text with bound parameters.** No statement is built from input, placeholder lists
included: a set of ids goes in as one JSON parameter read with `json_each(?)`, and a partial ticket
update reads the row, merges in TypeScript and writes every column with one fixed `UPDATE`. Every
write runs in a `BEGIN IMMEDIATE` transaction that rolls back on a refusal or a throw.

**The request schemas are the gate; the tables hold structure.** `core/board/schema.ts` (zod,
Node-free) checks lengths, the colour and priority vocabularies and dates. The tables hold keys,
uniqueness and references, and no vocabulary `CHECK`, so a longer palette later needs no table
rebuild. A colour or priority this version doesn't know reads as none.

**The page imports `core/board/schema.ts`.** `react-forms.md` § One Schema per Component says a
form reuses a route's schema from `core/` when it is Node-free. So the request schemas, the limits,
`derivePrefix` and `ticketKey` live in `core/board/schema.ts`, which imports only `zod` and
`core/types.ts`, and that file joins `tsconfig.web.json`'s `include` and `mise.toml`'s build
`sources` (the two lists mirror each other). `core/board/db.ts` and the rest import `node:sqlite`
and are never imported by the page.

**Colours stay in step through the type checker.** `core/types.ts` gains `BOARD_COLOURS`, the same
14 names as `SWATCHES`. A board colour is handed to `swatchFill({ colour })`, and `ColourMenu`'s
`onPick` and `SwatchPicker`'s `onChange` hand a `Swatch` to a function that takes a
`BoardColour`; if either list gains a name the other lacks, one of those call sites stops
compiling. No test compares the
lists. A colour reaches the DOM only as a `cva` class, never as a style string.

**Overdue is the server's.** `overdue` is computed in `core/board/read.ts` from `due_on` and the
machine's local date (`context.now`, so a test sets it), per `react-hooks.md` § Derive, Don't
Store ("what the server decides stays the server's"). Due today is not overdue.

**State on the page.**

- The project and the open ticket ride in the hash's query (`/board?project=3&ticket=12`), as the
  GitHub tab's `repo` and `pr` do (`web/lib/github-links.ts`). Project id and ticket number are
  both unchanged by a prefix rename, so a link survives one.
- A bare `/board` shows the project last opened in this browser (`localStorage`, through
  `web/lib/board-prefs.ts`, per `react-providers.md` § State That Outlives a Reload), else the
  first unarchived one.
- Search and filters are `useState` in `useBoardFilters` (`react-hooks.md` § 2, Input State
  Hooks). The page renders the board area keyed by project id, so each project starts with empty
  filters and no effect clears state.
- Server data is TanStack Query: `refetchOnWindowFocus` (the default) and invalidation after every
  action, no `refetchInterval` (`react-data-fetching.md` § Polling, first row of the table). Every
  board mutation invalidates the broad key `['board']` in `onSettled`.

**Drag and drop follows `web/components/checkouts/repo-section.tsx`**: handlers on the container,
`data-*` attributes on the rows, a drop line, and the move maths as pure functions in `web/lib/`
with a `node:test` file. No optimistic cache write in v1 (Open questions).

**Markdown moves to `ui/`.** `web/components/github/markdown.tsx` becomes
`web/components/ui/markdown.tsx` (`react-components.md` § Where a Component Lives: a second feature
needs it, and it has no domain in it). The board writes its own comment editor so its schema comes
from `core/board/schema.ts`; `github/comment-form.tsx` stays where it is.

**Toasts.** Create, save, archive, restore and delete raise one success or failure toast
(`react-toasts.md` § Raising One). A card move and a change made straight on a ticket (column,
priority, due date, labels) raise only the failure toast, as `renameRepo` in
`web/hooks/use-repos.ts` does: the card's new place is the feedback. Failures go through
`toastFailure(title, failure)` (`web/lib/toast-failure.ts`).

## Implementation Sections

Each section ends with its gate green. Sections 1 to 5 are `mise run test && mise run lint`;
6 to 9 are `mise run lint && mise run build`, then a look at the page. Sections 8 and 9 add
tests too, so they run both.

### Section 1: Decision record and PLAN.md

**Files to modify/create:**

- `docs/decisions/board-sqlite.md` - new record, "The ticket board is kept in SQLite, through
  node:sqlite", `Accepted — 2026-11`, 40 to 80 lines:
  - _Context_: the board holds what a person wrote, which no command can read back; PLAN.md's
    first principle had the monitor keep almost nothing; the data is relational (projects, columns,
    tickets, labels, comments) with ordering and counters that must change together.
  - _Decision_: `node:sqlite`'s `DatabaseSync`, one file at `~/.local/state/stack-monitor/board.db`
    (`$STACK_MONITOR_BOARD`), opened per call, STRICT tables, versioned by `user_version`,
    always on, no config section. This repo's own work stays in GitHub Issues
    (`tickets-github-issues.md`); the board is a feature for the user's projects.
  - _Alternatives rejected_: MongoDB in Docker (Docker must be up before the board loads; a driver
    dependency); dockerising the monitor (it reads the host: `ps`, `lsof`, `docker ps`, worktrees,
    launchd); a JSON file like `schedules.json` (every write rewrites everything; numbering, order
    and cascades by hand); GitHub Issues through `gh` (needs a repo and a network, public, no
    per-project columns or manual order); browser `localStorage` (one browser, lost with site data,
    out of reach of a later MCP tool or workflow); `better-sqlite3` (a second native module to
    rebuild for Electron beside `node-pty`).
  - _Consequences_: "Reads, doesn't remember" now has a named exception; one file to back up, and
    deleting is permanent; a file from a newer version refuses to open in an older monitor;
    `node:sqlite` is not yet marked stable in Node 24, pinned through `mise.toml`; schema changes
    are migrations from here on.
- `docs/decisions/README.md` - index row for `board-sqlite.md`.
- `PLAN.md`:
  - § What this is: add "and keep a board of tickets" to the list of what one page does.
  - § Principles, first bullet: replace the last sentence with "What's kept is what a person wrote
    and the machine can't be asked for again: the tracked repos, schedules, run logs and the ticket
    board (`docs/decisions/board-sqlite.md`)."
  - § Modules: table row `| Ticket board | always | projects, each a board of tickets in columns, with labels, priorities, due dates and comments |`,
    and a `### Ticket board` section: what a project, column, label and ticket are, the id rule,
    where the file lives, that it reads no repo and has no MCP tool yet.
  - § Layout: `board/        the ticket board's SQLite file, projects, columns, labels, tickets`
    under `core/`.
  - § Steps: `9. **Ticket board.**` with one sentence; § Open decisions: "Starting a workflow from
    a ticket" as the follow-up (`agents.arguments.ticket` already matches the id).
- `.agents/skills/implement/SKILL.md` - the `core` section's "(… only schedules and run logs are
  kept)" gains the board, so the skill and PLAN.md agree (Open questions).

`MODULE_NAMES` in `core/types.ts` is not touched: it lists a repo's config sections, and the board
belongs to no repo.

**Tests:**

- None: no new rule

### Section 2: Types, request schemas and the database file

**Files to modify/create:**

- `core/types.ts` - the shapes below, under a `// ---- Ticket board ----` rule
- `core/board/schema.ts` - new; Node-free request schemas, limits, `derivePrefix`, `ticketKey`
- `core/board/db.ts` - new; where the file is, opening, migrating, the read and write wrappers
- `tsconfig.web.json` - `include` gains `core/board/schema.ts`
- `mise.toml` - `[tasks.build]` `sources` gains `core/board/schema.ts`
- `tests/board.test.ts` - new

**Config changes:** none.

**Type definitions (`core/types.ts`):**

`BOARD_COLOURS` is a `const` array of the 14 names in `web/lib/swatches.ts`, in its order, and
`BoardColour` its union, declared the way `MODULE_NAMES` and `ModuleName` are. Then:

```typescript
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
```

**Request schemas (`core/board/schema.ts`):**

```typescript
export const MAX_TITLE = 200
export const MAX_DESCRIPTION = 16_000
export const MAX_COMMENT = 8_000
export const MAX_COLUMNS = 20
export const MAX_TICKET_LABELS = 20

const Id = z.number().int().positive()
const QueryId = z.coerce.number().int().positive()
export const Colour = z.enum(BOARD_COLOURS).nullable()
export const ShortName = z.string().trim().min(1, 'Name it').max(40)
export const ProjectName = z.string().trim().min(1, 'Name it').max(80)
export const Prefix = z
  .string()
  .trim()
  .toUpperCase()
  .regex(
    /^[A-Z][A-Z0-9]{0,9}$/,
    'Start with a letter; up to 10 letters and digits',
  )
export const Title = z
  .string()
  .trim()
  .min(1, 'Give it a title')
  .max(MAX_TITLE)
  .regex(/^[^\r\n]*$/, 'Keep the title to one line')
export const Description = z.string().max(MAX_DESCRIPTION)
export const CommentBody = z
  .string()
  .trim()
  .min(1, 'Write something first')
  .max(MAX_COMMENT)
export const PriorityName = z.enum(PRIORITIES)
export const DueOn = z.iso.date().nullable()
export const LabelIds = z.array(Id).max(MAX_TICKET_LABELS)
const Place = z.enum(['before', 'after'])

export const UpdateTicketRequest = z
  .strictObject({
    id: Id,
    title: Title.optional(),
    description: Description.optional(),
    priority: PriorityName.optional(),
    dueOn: DueOn.optional(),
    labels: LabelIds.optional(),
  })
  .refine((ticket) => Object.keys(ticket).length > 1, 'Name a field to change')

export function ticketKey(prefix: string, number: number): string {
  return `${prefix}-${number}`
}

// The first five letters of the name, or PRJ when it has none: "Beans & co" is BEANS.
export function derivePrefix(name: string): string {
  return (
    name
      .replace(/[^A-Za-z]/g, '')
      .slice(0, 5)
      .toUpperCase() || 'PRJ'
  )
}
```

The other requests follow one pattern, with the keys Section 5's table lists for each route:

- A POST body is a `z.strictObject`; a GET query is a `z.object` whose ids are `QueryId`.
- A key marked `?` there is `.optional()`, with two exceptions that take a `.default()` so core
  always gets a value: `colour` on every save (`null`), and on `CreateTicketRequest`
  `description` (`''`), `priority` (`'none'`), `dueOn` (`null`) and `labels` (`[]`).
- `name` is `ProjectName` on a project and `ShortName` on a column or label. `project` on
  `SaveLabelRequest` and `beside` on `MoveTicketRequest` are `Id.nullable()`. `order` is
  `z.array(Id).min(1).max(MAX_COLUMNS)`. `archived` is `z.boolean()`.
- The names: `ProjectQuery`, `TicketQuery`, `ArchivedQuery`, `SaveProjectRequest`,
  `ArchiveRequest` (projects and tickets), `IdRequest` (every delete but a column's),
  `SaveColumnRequest`, `ReorderColumnsRequest`, `DeleteColumnRequest`, `SaveLabelRequest`,
  `CreateTicketRequest`, `UpdateTicketRequest`, `MoveTicketRequest`, `SaveCommentRequest`.
- `DEFAULT_COLUMNS` is a `const` array of the six starting names, in order.
- Each request has a `z.input` alias for the hooks (`SaveProject`, `SaveColumn`,
  `ReorderColumns`, `DeleteColumn`, `SaveLabel`, `CreateTicket`, `UpdateTicket`, `MoveTicket`,
  `SaveComment`), so no request shape is written by hand in `core/types.ts`.

The field schemas are exported for the forms: a form's schema is a `z.object` of them, with no
defaults, so its values type has every field. (`.pick()` and `.omit()` throw in zod 4 on
`UpdateTicketRequest`, which carries a refinement.)

The limits fit `MAX_BODY_BYTES` (64 KiB, `server/routes.ts`), which stays as it is: 16,000 UTF-16
units are at most 48 kB of UTF-8, and JSON escaping a newline costs one more byte. A body that
still comes out over the cap is answered 400 "Request body is too large" by `server/http.ts`.

**The tables (`core/board/db.ts`, `MIGRATIONS[0]`):**

```sql
CREATE TABLE project (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  prefix TEXT NOT NULL UNIQUE,
  colour TEXT,
  next_number INTEGER NOT NULL DEFAULT 1,
  archived_at TEXT
) STRICT;

CREATE TABLE board_column (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES project (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  colour TEXT,
  position INTEGER NOT NULL,
  UNIQUE (project_id, id)
) STRICT;
CREATE UNIQUE INDEX board_column_name ON board_column (project_id, name COLLATE NOCASE);

CREATE TABLE label (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER REFERENCES project (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  colour TEXT
) STRICT;
CREATE UNIQUE INDEX label_name ON label (ifnull(project_id, 0), name COLLATE NOCASE);

CREATE TABLE ticket (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES project (id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  column_id INTEGER NOT NULL,
  position INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'none',
  due_on TEXT,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (project_id, number),
  FOREIGN KEY (project_id, column_id) REFERENCES board_column (project_id, id)
) STRICT;
CREATE INDEX ticket_column ON ticket (column_id, position);

CREATE TABLE ticket_label (
  ticket_id INTEGER NOT NULL REFERENCES ticket (id) ON DELETE CASCADE,
  label_id INTEGER NOT NULL REFERENCES label (id) ON DELETE CASCADE,
  PRIMARY KEY (ticket_id, label_id)
) STRICT, WITHOUT ROWID;
CREATE INDEX ticket_label_label ON ticket_label (label_id);

CREATE TABLE comment (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES ticket (id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  edited_at TEXT
) STRICT;
CREATE INDEX comment_ticket ON comment (ticket_id);
```

What the references do, checked against Node 24.21's SQLite with this exact schema:

- Deleting a project takes its columns, tickets, own labels, label links and comments in one
  statement; shared labels (`project_id IS NULL`) stay.
- The composite key on `ticket` refuses a ticket in another project's column, and, having no
  `ON DELETE`, refuses deleting a column that still has tickets. Core checks both first so the
  message is readable; the table is the second line.
- Deleting a ticket takes its comments and label links; deleting a label takes its links.
- `UNIQUE (project_id, number)` is also the lookup a later "start a workflow from BEANS-12" needs.

**Code changes (`core/board/db.ts`):**

```typescript
export const BOARD_ENV = 'STACK_MONITOR_BOARD'
export const SCHEMA_VERSION = 1

export interface BoardContext {
  file: string
  now?: () => Date // a test's clock
}

export type Problem = { problem: string }

export function boardFile(env: NodeJS.ProcessEnv = process.env): string
export function boardContext(file: string): BoardContext

// The database at the current schema version, its folder made first. A problem when the file
// isn't SQLite, can't be opened, or was written by a newer monitor; the file is left as it was.
export function openBoard(
  file: string,
  migrations: readonly string[] = MIGRATIONS,
): DatabaseSync | Problem

// Several reads of one snapshot, then closed.
export function read<T>(
  context: BoardContext,
  work: (db: DatabaseSync) => T,
): T | Problem

// One transaction, closed after. Rolled back when work answers ok: false or throws; a problem
// opening the file is refuse(problem).
export function write<R extends ActionResult>(
  context: BoardContext,
  refuse: (message: string) => R,
  work: (db: DatabaseSync, now: string) => R,
): R
```

`boardFile` mirrors `schedulesDir` in `core/schedules/store.ts`. An error SQLite throws inside
`work` (disk full, still locked after 2 s) is rethrown after the rollback and close, and
`server/http.ts` answers it as a 500 JSON failure.

**Tests (`tests/board.test.ts`, `describe('the board file')` and `describe('board requests')`):**

- `a new file is made, folder and all, at the current schema version`
- `a file that isn't SQLite, or is from a newer version, is a problem and is left alone` (one
  test, looping over the two files)
- `only the migrations a file is missing run` (a file at version 1, `openBoard` given a two-step
  list: step 2's table exists, step 1 did not run again)
- `a write that refuses or throws changes nothing`
- `derivePrefix takes the name's first five letters` (loop over names, one with no letters)
- `the request schemas refuse what the tables would otherwise hold` (loop: an empty and an
  over-long title, a title with a newline, a colour that isn't a swatch, a prefix with a digit, a
  date that isn't one such as 2026-02-30, an unknown key, an update naming no field)

### Section 3: Projects, columns and the reads

**Files to modify/create:**

- `core/board/read.ts` - new
- `core/board/projects.ts` - new; projects and their columns
- `tests/board.test.ts` - more cases

**Code changes:**

`core/board/read.ts` holds the reads; null means no such project:

```typescript
export function readBoard(context: BoardContext): BoardOverview | Problem
export function readProjectBoard(
  id: number,
  context: BoardContext,
): ProjectBoard | Problem | null
```

`core/board/projects.ts` holds the writes below. Every write in `core/board/` has one shape:
`fn(request: z.output<typeof <Schema>>, context: BoardContext): ActionResult`, or
`fn(id: number, context)` for a delete. `saveProject` answers `SaveProjectResult` and
`createTicket` `CreateTicketResult`.

| Function         | Does                                                                                                                                  | Refuses                                                                                                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `saveProject`    | no `id`: inserts it with `DEFAULT_COLUMNS` at positions 0 to 5, prefix `derivePrefix(name)` when none is given; `id`: updates the row | an unknown `id`; a prefix another project has, archived ones included ("BEANS is ALPHA's prefix. Choose another.")                                                                      |
| `archiveProject` | sets or clears `archived_at`; already in that state is `ok`                                                                           | an unknown `id`                                                                                                                                                                         |
| `deleteProject`  | deletes the row; the cascade takes the rest; the message says how many tickets went                                                   | an unknown `id`                                                                                                                                                                         |
| `saveColumn`     | no `id`: adds it after the last; `id`: renames and recolours                                                                          | an unknown project or column; a column of another project; a name the project already has, whatever its case; a 21st column                                                             |
| `reorderColumns` | writes positions `0..n-1` in the order given                                                                                          | an `order` that isn't exactly the project's column ids, each once                                                                                                                       |
| `deleteColumn`   | moves its tickets, archived ones too, to the end of `moveTo` in their order, then deletes it                                          | an unknown column; the project's last column; tickets and no `moveTo` ("It has 5 tickets, 2 of them archived. Choose the column they move to."); a `moveTo` that is itself or elsewhere |

`readProjectBoard` answers an archived project's board too; the page shows a Restore notice
instead of lanes. Core does not refuse writes to an archived project (Open questions).

**Tests (`describe('projects and columns')`):**

- `a new project starts with the six columns, in order`
- `a prefix belongs to one project, archived ones included` (create and rename both refused)
- `the reads answer projects unarchived first and columns left to right`
- `archiving a project keeps its board; restoring brings it back`
- `a column is added last, renamed and recoloured; a second "todo" is refused`
- `reordering takes the project's columns in any order and nothing else`
- `deleting a column with tickets needs somewhere to move them` (lands after the target's own, in
  order, archived ones included; itself and another project's column refused as targets)
- `a project's last column can't be deleted`

### Section 4: Labels, tickets and comments

**Files to modify/create:**

- `core/board/labels.ts` - new
- `core/board/tickets.ts` - new; tickets, their order, their comments
- `core/board/read.ts` - `readTicket` and `readArchivedTickets`
- `tests/board.test.ts` - more cases

**Code changes:**

`core/board/read.ts` gains `readTicket(project, number, context)`, answering
`TicketDetail | Problem | null`, and `readArchivedTickets(project, context)`, answering
`ArchivedTickets | Problem | null`. `core/board/labels.ts` holds the two label writes and
`core/board/tickets.ts` the rest, in the shape Section 3 gives.

| Function        | Does                                                                                                | Refuses                                                                                                                                                                      |
| --------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `saveLabel`     | no `id`: adds it, shared when `project` is null; `id`: renames and recolours                        | an unknown label or project; a `project` that differs from the stored one ("A label stays shared or with its project"); a name already visible in that project (see below)   |
| `deleteLabel`   | deletes it; the message says how many tickets it came off                                           | an unknown `id`                                                                                                                                                              |
| `createTicket`  | takes the project's next number, lands at the top of `column` (the first column when none is given) | an unknown project; a column of another project; a label that is neither shared nor this project's                                                                           |
| `updateTicket`  | changes only the fields named; `labels` replaces the set; `dueOn: null` clears the date             | an unknown `id`; a label that is neither shared nor this project's                                                                                                           |
| `moveTicket`    | sets its column and rewrites the target column's positions around it                                | an unknown `id`; an archived ticket; a column of another project; a `beside` that is the ticket itself or isn't an unarchived ticket in that column ("That card has moved.") |
| `archiveTicket` | sets or clears `archived_at`; a restore lands at the top of its column                              | an unknown `id`                                                                                                                                                              |
| `deleteTicket`  | deletes it; its comments and label links go with it                                                 | an unknown `id`                                                                                                                                                              |
| `saveComment`   | no `id`: adds it; `id`: replaces the body and sets `edited_at`                                      | an unknown ticket; a comment that isn't on that ticket                                                                                                                       |
| `deleteComment` | deletes it                                                                                          | an unknown `id`                                                                                                                                                              |

Label names: no two labels a project can see share a name, whatever their case. A project label
can't take a shared label's name or another of its project's; a shared label can't take any
label's name ("BEANS already has a label called bug"). The index covers each scope; core checks
across scopes.

**Tests (`describe('labels')`, `describe('tickets')`, `describe('comments')`):**

- `a shared label goes on any project's ticket; a project's label only on its own` (the board
  lists shared labels first, each group by name)
- `no two labels a project can see share a name, and a label keeps its scope`
- `deleting a label takes it off its tickets`
- `tickets are numbered per project, and a deleted ticket's number is never given again`
- `renaming the prefix renames the tickets' keys and keeps their numbers`
- `a new ticket lands at the top of its column`
- `a move within a column lands before or after its anchor and stays there`
- `a move to another column changes the ticket's column at the place it was dropped` (a null
  `beside` is the top)
- `a move is refused for an archived ticket, another project's column, or an anchor that has left`
- `an update changes only the fields it names; labels replace the set`
- `a ticket past its due date is overdue in any column; one due today is not` (`context.now`)
- `an archived ticket leaves the board for the archived list; restored, it is back on top`
- `deleting a ticket takes its comments`
- `comments read oldest first; an edit marks it edited; one from another ticket is refused`
- `deleting a project takes everything of its own and leaves shared labels` (columns, tickets,
  comments and its labels go; the message says how many tickets)

### Section 5: Routes

**Files to modify/create:**

- `server/routes.ts` - a third `makeRoutes` parameter, `board`, a `BoardContext` that defaults
  to `boardContext(boardFile())`; a `boardRead` helper beside `unlisted`; and the entries below
- `tests/board-routes.test.ts` - new, shaped like `tests/agent-routes.test.ts`: sets
  `process.env[BOARD_ENV]` to a temp file before `startMonitor` and puts it back after

`server/monitor.ts` and `server/launch.ts` don't change: the default context reads the env, and
nothing is opened until a board route is called.

```typescript
type BoardRead = BoardOverview | ProjectBoard | TicketDetail | ArchivedTickets

// A board read: 500 when the file can't be read, 404 when it holds no such row.
function boardRead(
  found: BoardRead | { problem: string } | null,
  missing: string,
): Reply {
  if (found === null) return [404, failure(missing)]
  return 'problem' in found ? unlisted(found) : [200, found]
}
```

| Route                              | Input                                                                   | Calls                 | Answers                |
| ---------------------------------- | ----------------------------------------------------------------------- | --------------------- | ---------------------- |
| `GET /api/board`                   | none                                                                    | `readBoard`           | `BoardOverview`        |
| `GET /api/board/project`           | `?id=`                                                                  | `readProjectBoard`    | `ProjectBoard`, 404    |
| `GET /api/board/ticket`            | `?project=&number=`                                                     | `readTicket`          | `TicketDetail`, 404    |
| `GET /api/board/archived`          | `?project=`                                                             | `readArchivedTickets` | `ArchivedTickets`, 404 |
| `POST /api/board/projects/save`    | `{ id?, name, prefix?, colour? }`                                       | `saveProject`         | `SaveProjectResult`    |
| `POST /api/board/projects/archive` | `{ id, archived }`                                                      | `archiveProject`      | `ActionResult`         |
| `POST /api/board/projects/delete`  | `{ id }`                                                                | `deleteProject`       | `ActionResult`         |
| `POST /api/board/columns/save`     | `{ id?, project, name, colour? }`                                       | `saveColumn`          | `ActionResult`         |
| `POST /api/board/columns/reorder`  | `{ project, order }`                                                    | `reorderColumns`      | `ActionResult`         |
| `POST /api/board/columns/delete`   | `{ id, moveTo? }`                                                       | `deleteColumn`        | `ActionResult`         |
| `POST /api/board/labels/save`      | `{ id?, project, name, colour? }`                                       | `saveLabel`           | `ActionResult`         |
| `POST /api/board/labels/delete`    | `{ id }`                                                                | `deleteLabel`         | `ActionResult`         |
| `POST /api/board/tickets/create`   | `{ project, column?, title, description?, priority?, dueOn?, labels? }` | `createTicket`        | `CreateTicketResult`   |
| `POST /api/board/tickets/update`   | `{ id, title?, description?, priority?, dueOn?, labels? }`              | `updateTicket`        | `ActionResult`         |
| `POST /api/board/tickets/move`     | `{ id, column, beside, place: 'before' \| 'after' }`                    | `moveTicket`          | `ActionResult`         |
| `POST /api/board/tickets/archive`  | `{ id, archived }`                                                      | `archiveTicket`       | `ActionResult`         |
| `POST /api/board/tickets/delete`   | `{ id }`                                                                | `deleteTicket`        | `ActionResult`         |
| `POST /api/board/comments/save`    | `{ id?, ticket, body }`                                                 | `saveComment`         | `ActionResult`         |
| `POST /api/board/comments/delete`  | `{ id }`                                                                | `deleteComment`       | `ActionResult`         |

Every POST is `route(<Schema>, '<input as above>', async (body) => settled(fn(body, board)))`
(a delete passes `body.id`): 200 when done, 409 when core refused, 400 when the body fails its
schema. Routes are matched on the exact path (`server/http.ts`), so a project's board is `?id=`,
not `/projects/<id>`. Ids in a GET arrive as text and are coerced, as `PullNumber` in
`core/github/github.ts` is.

**Tests (`tests/board-routes.test.ts`, `describe('the board routes')`):**

- `a project, a ticket, a move and a comment, read back over HTTP` (the JSON shapes and the 200s)
- `a body that fails its schema is a 400 naming the field` (an unknown key; a colour that isn't a
  swatch)
- `a refusal is a 409 with core's message` (a taken prefix)
- `a project or ticket that isn't there is a 404`
- `a file that isn't a board: a read answers 500 with the problem, a write 409 with it`

### Section 6: The page's frame: sidebar, route, projects

**Files to modify/create:**

- `web/components/ui/markdown.tsx` - moved from `web/components/github/markdown.tsx`, unchanged;
  `github/conversation.tsx` and `github/review-thread.tsx` import the new path
- `web/components/ui/swatch-picker.tsx` - new; `SwatchPicker({ value, onChange, label })`, a
  radio group of the swatches plus none for a form field, built on `swatchFill` like `ColourMenu`
- `web/components/layouts/sidebar.tsx` - `GROUPS` gains
  `{ heading: 'Product management', links: [{ to: '/board', label: 'Ticket board', icon: SquareKanban, end: false }] }`
  as its third entry
- `web/router.tsx` - `{ path: 'board', element: <TicketBoard /> }`
- `web/lib/board-links.ts` - `boardPath(project: number, ticket?: number): string` and
  `readId(value: string | null): number | null`, as `github-links.ts` has `pullPath` and
  `readPullNumber`
- `web/lib/board-prefs.ts` - `readLastProject(): number | null`, `storeLastProject(id)`; key
  `stack-monitor:board-project`; both catch a storage throw
- `web/hooks/use-board.ts` - `boardKey = ['board'] as const`; `useBoard()` returns
  `{ projects, isPending, error, isStale }` from `GET /api/board`
- `web/hooks/use-board-route.ts` - `useBoardRoute()` returns
  `{ projectId, ticketNumber, openProject, openTicket, closeTicket, leaveProject }`: the query's
  `project` (else the stored one) and `ticket`, and `navigate` calls built with `boardPath`;
  stores the project it opens
- `web/hooks/use-project-mutations.ts` - `useProjectMutations()` returns
  `{ saveProject, archiveProject, deleteProject, isDeleting }`
- `web/hooks/use-board-flow.ts` - `useBoardFlow()`, the feature's one flow hook
  (`react-hooks.md` § 5): `createProject` (then `openProject(result.id)`), `removeProject` and
  `shelveProject` (then `leaveProject()`), and in Section 7 `removeTicket` and `shelveTicket`
  (then `closeTicket()`). It calls the mutation hooks; it runs no `useMutation` of its own
- `web/components/pages/ticket-board.tsx` - `TicketBoard`
- `web/components/board/project-picker.tsx` - `ProjectPicker`: a `DropdownMenu` on the current
  project's name and colour dot, listing unarchived projects, then "New project…" and "Archived
  projects…"
- `web/components/board/project-dialog.tsx` - `ProjectDialog`: create and edit; fields name,
  prefix, colour
- `web/components/board/project-menu.tsx` - `ProjectMenu`: Edit, Labels, Archived tickets,
  Archive project, Delete project
- `web/components/board/archived-projects-dialog.tsx` - `ArchivedProjectsDialog`: each with
  Restore and Delete
- `web/components/board/confirm-delete-dialog.tsx` - `ConfirmDeleteDialog`, the one `AlertDialog`
  for deleting a project, a ticket, a label or a comment. Props: `open`, `title`, `description`,
  `confirmLabel`, `onConfirm` (`() => Promise<void>`; the action button is disabled while it
  runs) and `onClose`

**Code changes:**

`web/components/board/project-dialog.tsx`, above the component:

```tsx
const projectFormSchema = z.object({
  name: ProjectName,
  prefix: Prefix,
  colour: Colour,
})

type ProjectFormValues = z.infer<typeof projectFormSchema>
```

- The prefix field follows `derivePrefix(name)` until the user edits it. A refusal (a taken
  prefix) is the failure toast and the dialog stays open (`react-forms.md` § Submit With an Async
  `onSubmit`).
- Every query hook follows `use-pulls.ts`: an exported key built on `boardKey`, named values,
  `useMemo` on the result, `error` only while there is no data, `isStale` from `isRefetchError`.
- Every mutation follows `use-repos.ts`: `postJson<SaveProjectResult>` or `postAction`, toasts in
  `onSuccess` and `onError`, `onSettled: () => queryClient.invalidateQueries({ queryKey: boardKey })`.
- Delete project's dialog reads "Delete Beans and its 12 tickets?", with the 3 archived ones named
  when there are any, from `BoardProject.tickets` and `archivedTickets`.
- Callback props that take nothing are `NoArgCallback` (`web/lib/callbacks.ts`).

**`TicketBoard`'s states** (`react-components.md` § Rendering):

| When                    | Shows                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| the overview is loading | `Skeleton`s in the shape of a toolbar and four lanes                                     |
| the overview failed     | `<p role="alert">` with the message (this is where an unreadable `board.db` says so)     |
| no project at all       | a `Card`: "No projects yet", what a project is, and a New project button                 |
| only archived projects  | "Every project is archived", with New project and Archived projects                      |
| `?project=` names none  | "There's no project 9." and a link to `/board`, as `github.tsx` does for an unknown repo |
| the project is archived | its name, "This project is archived", and Restore                                        |
| otherwise               | `<BoardView key={project.id} project={project} />` (Sections 7 to 9)                     |

**Tests:**

- None: no new rule on the server; the routes are covered by `tests/board-routes.test.ts`

**In the browser** (`STACK_MONITOR_BOARD=<scratch file> STACK_MONITOR_PORT=7430 mise run dev`):
the group and link show, collapsed rail included; the empty state; create a project and land on
it; rename its prefix; archive, restore, delete with the count; a text file as `board.db` shows
the problem; the GitHub tab's markdown still renders.

### Section 7: Lanes, cards and the ticket dialog

**Files to modify/create:**

- `web/hooks/use-project-board.ts` - `projectBoardKey(id)`; `useProjectBoard(id: number | null)`
  returns `{ board, isPending, error, isStale }`
- `web/hooks/use-ticket.ts` - `boardTicketKey(project, number)`;
  `useTicket(project, number | null)` returns `{ ticket, isPending, error }`; a 404 is not retried
  (`web/app.tsx` already skips 4xx)
- `web/hooks/use-ticket-mutations.ts` - `useTicketMutations()` returns `createTicket`,
  `updateTicket`, `moveTicket`, `archiveTicket`, `deleteTicket`, `saveComment`, `deleteComment`
  and `isMoving`
- `web/hooks/use-column-mutations.ts` - `useColumnMutations()` returns `saveColumn`,
  `reorderColumns` and `deleteColumn`
- `web/components/board/priority.ts` - `PRIORITY_LABELS: Record<Priority, string>`
- `web/components/board/priority-icon.tsx` - `PriorityIcon({ priority })`: a lucide icon per
  priority from a `Record<Priority, …>`, with the label as `sr-only` text and a `Tip`
- `web/components/board/board-label-pill.tsx` - `BoardLabelPill({ label })`: a `Pill` with a
  `swatchFill` dot and the name
- `web/components/board/ticket-card.tsx` - `TicketCard`: key, title as a `<Link>` to
  `boardPath(project, number)`, `PriorityIcon`, label pills, the due date as a `Pill`
  (`tone="attention"` and the word "Overdue" when `ticket.overdue`), the comment count
- `web/components/board/column-lane.tsx` - `ColumnLane`: header (colour dot, name, count, a +
  button, `ColumnMenu`) and the cards, or "No tickets" when the lane is empty
- `web/components/board/board-lanes.tsx` - `BoardLanes`: the lanes side by side in an
  `overflow-x-auto` strip, and an Add column button after the last
- `web/components/board/column-menu.tsx` - `ColumnMenu`: Rename, `ColourMenu`, Move left, Move
  right, Delete
- `web/components/board/column-dialog.tsx` - `ColumnDialog`: add and rename; the form schema is
  `z.object({ name: ShortName, colour: Colour })`
- `web/components/board/delete-column-dialog.tsx` - `DeleteColumnDialog`: an `AlertDialog`; when
  the column has tickets, a required `Select` of the other columns ("Move its 5 tickets to")
- `web/components/board/new-ticket-dialog.tsx` - `NewTicketDialog`: title, description, column,
  priority, due date (`<Input type="date">`), labels; the form schema is a `z.object` of `Title`,
  `Description`, a column id, `PriorityName`, `DueOn` and `LabelIds`
- `web/components/board/ticket-dialog.tsx` - `TicketDialog`: open while `ticketNumber !== null`,
  closing calls `closeTicket()`; `Skeleton`, then `role="alert"` with the server's message (a
  404's "There's no ticket 12 in that project"), then the ticket
- `web/components/board/ticket-edit-form.tsx` - `TicketEditForm`: the description as `Markdown`
  with an Edit button; editing is a form over title and description
  (`z.object({ title: Title, description: Description })`), with
  `disabled={!isDirty || isSubmitting}` on Save
- `web/components/board/ticket-properties.tsx` - `TicketProperties`: `Select`s for column and
  priority, the date input with a Clear button, the `LabelPicker`; each change is one
  `updateTicket` or `moveTicket` call
- `web/components/board/label-picker.tsx` - `LabelPicker({ labels, value, onChange })`: a
  `DropdownMenu` of `DropdownMenuCheckboxItem`s, shared labels first
- `web/components/board/comment-thread.tsx` - `CommentThread`: each comment as `Markdown` with its
  date, "edited" when it was, Edit and Delete; "No comments yet." when empty
- `web/components/board/comment-editor.tsx` - `CommentEditor`: the add and edit form, with props
  `initial`, `submitLabel`, `onSubmit` and `onDone`; its schema is `z.object({ body: CommentBody })`
- `web/components/board/board-view.tsx` - `BoardView({ project })`: one project's board. Calls
  `useProjectBoard`, and renders the New ticket button, `BoardLanes` and this project's dialogs;
  lane-shaped `Skeleton`s while loading, `role="alert"` on failure, and "Couldn't refresh; showing
  the last read" when `isStale`
- `web/components/pages/ticket-board.tsx` - renders `BoardView` keyed by the project's id, and
  `TicketDialog`

**Notes:**

- A project with no tickets shows its empty lanes and one line above them: "No tickets yet. New
  ticket adds the first to Backlog." (the first column's name).
- The edit form's `defaultValues` come from the ticket once; a refetch at window focus doesn't
  reset what is being typed, and Save sends it (last save wins).
- Selecting a column in `TicketProperties` is `moveTicket` with `beside: null`: the top of that
  column.
- Deleting a ticket or a comment goes through `ConfirmDeleteDialog`; archiving asks nothing.
- The board is wider than the page pane's `max-w-6xl`; the strip scrolls sideways inside it
  (Open questions).

**Tests:**

- None: no new rule (what these call is covered by `tests/board.test.ts` and
  `tests/board-routes.test.ts`)

**In the browser:** add, rename, recolour and reorder columns; delete an empty one, one with
tickets (the target is required) and try the last; create a ticket from the header and from a
lane's +; open it from the card and from a pasted `/#/board?project=1&ticket=1`; Back closes it;
edit the description with a table, a link and `<script>alert(1)</script>` (it must show nothing and
run nothing); change column, priority, due date (yesterday shows Overdue) and labels; add, edit
and delete a comment; a second tab shows the changes when it gets focus.

### Section 8: Moving cards

**Files to modify/create:**

- `web/lib/board-order.ts` - new, pure, relative imports only (node runs it in the test, as
  `checkout-order.ts` notes)
- `web/components/board/board-lanes.tsx` - the drag handlers and the drop line
- `web/components/board/ticket-card.tsx` - `draggable` on the `<li data-ticket={id}>`,
  `draggable={false}` on the title link
- `web/components/board/column-lane.tsx` - `data-column={id}` on the lane
- `web/components/board/ticket-card-menu.tsx` - new; `TicketCardMenu`: Open, Move to column (a
  submenu of the other columns), Move up, Move down, Priority (a radio submenu), Archive, Delete
- `tests/board-view.test.ts` - new

**Code changes:**

`web/lib/board-order.ts`:

```typescript
export type Drop = Pick<MoveTicket, 'column' | 'beside' | 'place'>

export interface Over {
  column: number
  ticket: number | null // the card under the pointer; null over the lane's empty space
  place: 'before' | 'after' // which half of that card
}

// Where a dragged card would land among the cards shown, or null when it's already there.
export function dropFor(
  columns: BoardColumn[],
  dragged: number,
  over: Over,
): Drop | null

// One place up or down among the cards shown in its column; null at the end.
export function stepFor(
  tickets: TicketSummary[],
  id: number,
  step: -1 | 1,
): Drop | null
```

- `columns` and `tickets` are what the filters leave, so a drop lands beside a card the user can
  see. Over a lane's empty space the drop is after its last shown card, or `beside: null` when it
  shows none.
- `BoardLanes` keeps `dragging` and `drop` in `useState`, finds the lane and card with
  `closest('[data-column]')` and `closest('li[data-ticket]')`, and calls `preventDefault` on
  `dragover` only when `dropFor` answers a drop, exactly as `RepoSection` does with `moveCheckout`.
- Move up and Move down are disabled when `stepFor` answers null; Move to column sends
  `beside: null`.

**Tests (`tests/board-view.test.ts`, `describe('where a card lands')`):**

- `a card dropped on the top or bottom half of another lands before or after it`
- `a drop on a lane's empty space lands after its last shown card, or on top of an empty lane`
- `a drop where the card already is, is no move` (onto itself; after the card above; before the
  card below)
- `a step moves one place among the cards shown and stops at the ends`

**In the browser:** drag within a lane and across lanes, into an empty lane, with a filter on;
reload and the order holds; the menu's Move items do the same from the keyboard; note whether the
card visibly jumps back before the refetch (Open questions).

### Section 9: Labels, filters, the archived view, README

**Files to modify/create:**

- `web/lib/board-filter.ts` - new, pure
- `web/hooks/use-board-filters.ts` - `useBoardFilters(board: ProjectBoard | null)` returns
  `{ filters, setSearch, toggleLabel, togglePriority, clear, columns, hidden }`: `columns` is the
  board's with only matching tickets, `hidden` the count left out. `BoardView` calls it and hands
  `columns` to `BoardLanes`
- `web/hooks/use-label-mutations.ts` - `useLabelMutations()` returns `{ saveLabel, deleteLabel }`
- `web/hooks/use-archived-tickets.ts` - `archivedTicketsKey(project)`;
  `useArchivedTickets(project, enabled)` returns `{ tickets, isPending, error }`
- `web/components/board/board-toolbar.tsx` - `BoardToolbar`: the search `Input`, a Labels and a
  Priority `DropdownMenu` of checkbox items with a count badge, Clear, shaped like
  `checkouts/checkout-filters.tsx`; rendered by `BoardView` above the lanes
- `web/components/board/labels-dialog.tsx` - `LabelsDialog`: shared labels, then the project's,
  each with its uses, Edit and Delete ("Delete bug? It comes off 4 tickets."), and Add
- `web/components/board/label-form.tsx` - `LabelForm`: name, colour, and on create a scope choice
  (Shared, or this project); the schema is `z.object({ name: ShortName, colour: Colour, shared: z.boolean() })`
- `web/components/board/archived-tickets-dialog.tsx` - `ArchivedTicketsDialog`: key, title,
  column and date, with Restore and Delete; `Skeleton`, `role="alert"`, "Nothing archived"
- `tests/board-view.test.ts` - more cases
- `README.md` - a "Ticket board" paragraph after Schedules (projects, columns, ids, labels, where
  the file lives, `$STACK_MONITOR_BOARD`), and the status line names it

**Code changes:**

`web/lib/board-filter.ts`:

```typescript
export interface BoardFilters {
  search: string
  labels: number[]
  priorities: Priority[]
}

export const NO_FILTERS: BoardFilters = {
  search: '',
  labels: [],
  priorities: [],
}

// Title or id holds the search (BEANS-12, beans-12 or 12), it carries any of the labels, and its
// priority is one of those picked. An empty filter passes everything.
export function matchesTicket(
  ticket: TicketSummary,
  filters: BoardFilters,
): boolean
```

When the filters hide every ticket the lanes stay and a line above them reads "No tickets match
the search and filters." with Clear; otherwise "{hidden} hidden by the search or filters", as
`RepoSection` says it.

**Tests (`describe('what the filters show')`):**

- `the search matches the title or the id, whatever the case`
- `labels match any picked, priorities any picked, and the three narrow together`

**In the browser:** make a shared and a project label, see both in one project and only the shared
one in another; a duplicate name is refused; delete a label and it leaves its cards; each filter,
the three together, and the nothing-matches line; archive a ticket, find it in the archived view,
restore it to the top; then `mise run check`.

## Config & Contract

- **Config**: none. No `stack-monitor.json` section, `core/config/schema.ts` untouched, so no
  `mise run schema` and `examples/node-postgres.json` is unchanged. Every existing config loads.
- **Routes and shapes**: 19 new routes under `/api/board`, read only by the page. New types in
  `core/types.ts`; none existing changes. `makeRoutes` gains a third parameter with a default, so
  its callers don't change. No MCP tool (`mcp/` isn't in the tree).
- **Build inputs**: `core/board/schema.ts` joins `tsconfig.web.json`'s `include` and `mise.toml`'s
  build `sources`.
- **What the monitor starts keeping**: `~/.local/state/stack-monitor/board.db`
  (`$STACK_MONITOR_BOARD`), created with its folder on the first board request. It answers to
  PLAN.md § Principles "Reads, doesn't remember", which Section 1 amends, and to
  `docs/decisions/board-sqlite.md`. It runs no command, signals no process and deletes no
  directory; a delete removes rows, after an AlertDialog.
- **Local only**: the new routes sit behind the same Host, Origin, content-type and body-cap
  checks in `server/http.ts`; `MAX_BODY_BYTES` is unchanged.
- **Security**: ticket titles, names and labels render as text children; descriptions and comments
  only through `ui/markdown.tsx` (react-markdown, `skipHtml`, `http`, `https` and `mailto` links
  only, images as links). Nothing uses `dangerouslySetInnerHTML`. The CSP in `server/static.ts` is
  untouched. A colour is one of 14 names checked by zod and becomes a class, never a style. SQL
  takes input only as bound parameters.

## Verification Checklist

- [ ] "Product management" and "Ticket board" show in the sidebar, wide, collapsed and narrow
- [ ] A project is created with six columns, edited, archived, restored, and deleted with its count
- [ ] Ids read `<prefix>-<n>`; a prefix rename renames them; a deleted number isn't given again
- [ ] Columns add, rename, recolour, reorder and delete; a delete with tickets asks for a target;
      the last column stays
- [ ] Shared labels show in every project, a project's labels only in its own
- [ ] A ticket carries title, description, column, labels, priority, due date and comments; a past
      due date shows Overdue in any column
- [ ] Cards drag within and across lanes and keep their place after a reload; the menu does the
      same without a mouse
- [ ] Label filter, priority filter and search work alone and together
- [ ] Archive, the archived view, restore and delete work for tickets
- [ ] `/#/board?project=<id>&ticket=<n>` opens the ticket; Back closes it
- [ ] A second tab shows another tab's change when it gets focus
- [ ] A `board.db` that isn't SQLite, or is from a newer version, shows its problem and is left
      alone
- [ ] Markdown with raw HTML or a `javascript:` link renders inert; the GitHub tab still renders
- [ ] The decision record, its README row, PLAN.md and README.md are in the PR
- [ ] `mise run check` passes
- [ ] No regressions introduced

## Open questions

- **A project's board is `GET /api/board/project?id=`, not `/api/board/projects/<id>`.** The
  server matches routes on the exact path (`server/http.ts`). Recommended and assumed: query
  parameters, as every other read here uses.
- **"Ticket" already means a GitHub issue in this repo's skills and in
  `docs/decisions/tickets-github-issues.md`, and there is no `CONTEXT.md` to settle terms.**
  Recommended and assumed: the new record says the repo's own tracker stays GitHub Issues and the
  board is a feature for the user's projects; `CONTEXT.md` is not created in this PR
  (`docs/agents/domain.md` leaves that to `domain-modeling`).
- **Open the file per call, or keep one connection for the process?** Lightest: per call (about
  0.1 ms measured, nothing to close, recovers when a bad file is fixed). Recommended and assumed:
  per call.
- **Does a dropped card need an optimistic move?** Without one the card sits where it was until
  the refetch lands, a few milliseconds on localhost. Lightest: none. Recommended and assumed:
  none in v1; if the jump shows in Section 8's browser check, add `onMutate` with `setQueryData`
  on `projectBoardKey` and a rollback in `onError`.
- **Columns reorder from their menu (Move left, Move right), not by dragging.** Recommended and
  assumed; column dragging can follow.
- **The board sits inside the page pane's `max-w-6xl`** (`web/components/panes/page-pane.tsx`) and
  scrolls sideways. Recommended and assumed: leave the pane alone and judge it running; a wider
  pane for one route is its own change.
- **Filters and search aren't remembered across a reload; the last project is.** Recommended and
  assumed: a filter that comes back on its own hides tickets with no sign why.
- **Prefix rule: a letter, then up to nine more letters or digits** (`WEB2`). Changed in review
  from letters only, which refused a prefix the user might well choose. A renamed prefix frees the
  old one, and old ids don't redirect.
- **An archived project's tickets can still be written through the routes**; only the page stops
  offering it. Recommended and assumed: no refusal in core, since nothing is lost either way.
- **Moves and changes made straight on a ticket raise no success toast**, though
  `react-toasts.md` § Raising One says every action ends in one. Recommended and assumed: failure
  toast only, as `renameRepo` does on `main`.
- **PLAN.md § Principles says schedules are kept "in the clone's git dir"; they are in
  `~/.local/state/stack-monitor/schedules/`.** Recommended and assumed: Section 1's rewrite of
  that sentence drops the stale location.
- **`.agents/skills/implement/SKILL.md` repeats "only schedules and run logs are kept".**
  Recommended and assumed: update that parenthesis in this PR, said in the PR body.
- **`docs/decisions/markdown-react-markdown.md` names `web/components/github/markdown.tsx`**, and a
  record changes only its Status. Recommended and assumed: leave the record; the move is in the PR
  body.
- **`node:sqlite` is not yet marked stable in Node 24.** It loads with no warning in the pinned
  24.21.0 and in Electron 45.5; `package.json`'s `engines` (`>=24`) admits older 24 releases that
  print a warning to stderr. Recommended and assumed: accept, recorded in the decision's
  Consequences.
- **Deleting is permanent and there is no export.** Recommended and assumed: out of scope as
  decided; the README says the board is one file to copy.

## Style Guide Suggestions

The following patterns were observed but not covered by existing style guides:

- **A store module in `core/`**: `core/schedules/store.ts` and this plan share a shape no guide
  states: an exported `*_ENV` constant and a path function taking `env`, reads answering
  `T | { problem }`, writes answering `failure(...)`, a context object as the last parameter. A
  first `core/` guide could start here.
- **A refusal in a form**: `react-forms.md` says a refusal is the failure toast;
  `checkouts/new-worktree-dialog.tsx` puts it under the field with `form.setError`. The plan
  follows the guide. Recommend the guide say when a refusal belongs to a field.
- **`toastFailure`'s arguments**: the guides write `toastFailure(error, title)`;
  `web/lib/toast-failure.ts` is `toastFailure(title, failure)`. Recommend the guides match the
  code.
- **Silent successes**: `react-toasts.md` asks for one toast per action; `renameRepo` and the
  checkout prefs raise none where the page itself shows the result. Recommend the guide name that
  case.
- **Filter bars**: `react-forms.md` lists filter bars under "Applies to", while `react-hooks.md`
  § 2 and `checkouts/checkout-filters.tsx` use `useState`. The plan follows the hooks guide.
  Recommend `react-forms.md` drop filter bars.
- **Optimistic updates**: `react-data-fetching.md` § Mutations doesn't say whether a mutation may
  write the cache before the server answers. Worth a rule before the first one is written.
- **Native drag and drop**: `repo-section.tsx`, the panes and now the board share a pattern
  (handlers on the container, `data-*` on rows, pure move maths in `web/lib/` with a `node:test`
  file, menu items for the keyboard) that `react-components.md` could record.
