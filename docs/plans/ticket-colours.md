# Feature: Ticket colours, drawn as a sticky note

## Overview

A ticket can be given one of the board's colours (`BOARD_COLOURS`, `core/types.ts`). A coloured
card is a sticky note: the colour's outline and a light tint of it. A ticket with no colour stays
the plain card it is today, and a ticket never takes its column's colour. The colour is set from
the card's menu, from the ticket dialog, or by an agent through `board_create_ticket` and
`board_update_ticket`. `board_get_ticket` and `board_list_tickets` report it. Board ticket SM-11.

The branch is stacked on SM-10 (`feat/sm-10-column-lane-colours`, PR #29). That branch adds
`swatchSurface` and the `--color-swatch-<c>-surface` tokens, and this one draws the card with them.

## Requirements

- `board.db` gains `ticket.colour` through a new `MIGRATIONS` step. An existing file migrates
  when it's opened and keeps every ticket, each with no colour.
- `colour` on `CreateTicketRequest` (defaults to `null`) and `UpdateTicketRequest` (optional;
  `null` clears it, leaving it out keeps it).
- `colour: BoardColour | null` on `TicketSummary`, so `TicketDetail` and `ArchivedTicket` have it
  too. It is read through `asColour`, so a colour this version doesn't know reads as none.
- `board_create_ticket` and `board_update_ticket` take `colour`. `board_get_ticket` and
  `board_list_tickets` answer it on each ticket.
- The card: a coloured ticket gets an outline in its swatch and a tint of the same swatch. A
  ticket with no colour looks exactly as it does today, on a plain lane and on a coloured one.
- A colour picker in the card's menu (`ColourMenu`, as `column-menu.tsx` uses it) and in the
  ticket dialog's properties.
- Done when a colour set from the card menu, the dialog or `board_update_ticket` shows on the card
  after a refresh, and `mise run test && mise run lint` pass, with a migration test and a test of
  the update route's new field.
- Implicit: the change is additive for agents. Every call the tools took before still works.

## Technical Approach

- **The column.** A ticket's colour is a nullable `TEXT` column on `ticket`, like
  `project.colour`, `board_column.colour` and `label.colour`. There's no `CHECK`: the request
  schemas take only `BOARD_COLOURS`, and `asColour` reads anything else as none.
  `docs/decisions/board-sqlite.md` § Consequences says a change to the tables is a new step and a
  shipped step is never edited, so this is `MIGRATIONS[1]` (version 1 to 2). SM-12's boards step
  comes after it, as `MIGRATIONS[2]`.
- **The writes** go through the existing statements. `createTicket`'s `INSERT` takes the column.
  `updateTicket`'s one fixed `UPDATE` writes every column from the stored row with the named
  fields on top, so `colour` follows `dueOn`'s rule: `null` clears it, and leaving it out keeps
  it. The routes don't change beyond their usage strings, since `route()` parses with the request
  schema.
- **The tools** take `Colour` from `core/board/schema.ts`, the same field schema the routes use
  (`docs/decisions/mcp-stdio-by-hand.md`: each tool calls the core function its route calls).
  `card()` gains `colour`, which reaches both reads: `board_get_ticket` spreads `card(detail)`.
- **The look.** The card reuses SM-10's `swatchSurface` at the lane's strength. The surface is the
  tint. The outline is the card's existing `ring-1`, coloured with the swatch, so a coloured card
  keeps a plain card's size and padding and the edges of a lane's cards line up. For that,
  `swatchSurface` gains `ring-swatch-<c>` beside each `border-swatch-<c>`. Neither colour shows
  until a width class asks for it, so the lane, which sets only `border-t-3`, is unchanged.
  Checked against the worktree's Tailwind (4.3.5) by compiling `web/index.css`:
  `ring-swatch-red` is `--tw-ring-color: var(--swatch-red)`, and `--tw-ring-color` is registered
  with `inherits: false`, so the card's colour doesn't reach the focus rings inside it. `cn`
  keeps `ring-1` beside `ring-swatch-<c>` and beside `ring-foreground/10`, so the plain card's
  class set comes out the same as today's.
- **Same colour as its lane.** A yellow card on a yellow lane has the lane's background, and its
  outline is what marks it out. That edge is about as strong as a plain card's `ring-foreground/10`
  on white. The spec asks for a _light_ tint, so there's no second, stronger card strength; see
  Open questions for SM-10's K2 follow-up.
- **The pickers** send the change through `useTicketMutations().updateTicket`. That's the
  mutation for a change made straight on the ticket: it shows a toast only on failure
  ("Couldn't change the ticket") and refreshes the board's keys, as priority, the due date and
  labels already do. The card menu gets `ColourMenu`, wired like `column-menu.tsx`. The dialog
  gets `SwatchPicker`, the same choice laid out for a form (its own comment says so), as
  `column-dialog.tsx` and `label-form.tsx` use it.
- **Accessibility.** On a card the colour is decoration, as a column's or a label's is
  (`ColourDot` is `aria-hidden`). The checked radio in the menu and in the picker says which
  colour a ticket has.

## Implementation Sections

Sections 1 to 3 go in order (each needs the types before it). Sections 4 and 5 need Section 1's
type and Section 2's request field. Section 6 is docs.

### Section 1: The migration and the reads

**Files to modify:**

- `core/board/db.ts`: a second `MIGRATIONS` step.
- `core/types.ts`: `colour` on `TicketSummary`, and a ticket added to `BOARD_COLOURS`' comment.
- `core/board/read.ts`: `t.colour` in `TICKET_COLUMNS`, `colour` on its `TicketRow`, and
  `colour: asColour(row.colour)` in `toSummary`.

**Code changes:**

```typescript
// core/board/db.ts
export const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE project ( ... ) STRICT;
  ...
  `,
  'ALTER TABLE ticket ADD COLUMN colour TEXT;',
]
```

`ALTER TABLE ... ADD COLUMN` works on a `STRICT` table when the column has a type, and it runs
inside `migrate`'s `BEGIN IMMEDIATE`, so a failure leaves the file at version 1.

**Type definitions:**

```typescript
// core/types.ts
// The colours a project, a column, a label or a ticket can take: the page's swatches (web/lib/swatches.ts).
export const BOARD_COLOURS = [ ... ] as const

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
```

`readArchivedTickets` joins `board_column c`, which has a `colour` of its own. `TICKET_COLUMNS`
names `t.colour`, so the row's `colour` is the ticket's.

**Tests:**

- New, in `tests/board.test.ts` § the board file: "a board from before ticket colours opens with
  every ticket, each with no colour". It opens a file with `openBoard(file, MIGRATIONS.slice(0, 1))`,
  inserts a project, a column and a ticket by SQL (the version-1 tables), and closes it. Then
  `readTicket` migrates it: the ticket is there with `colour: null`, `PRAGMA user_version` is
  `MIGRATIONS.length`, and `updateTicket({ id, colour: 'yellow' })` saves and reads back. The
  slice stays right when SM-12 adds its step.
- Mechanical: `tests/board-view.test.ts`'s `card()` and `tests/board-routes.test.ts`'s
  `backlog.tickets` deep-equal gain `colour: null`.

### Section 2: The requests, the writes and the routes

**Files to modify:**

- `core/board/schema.ts`: `colour` on both ticket requests.
- `core/board/tickets.ts`: `colour` on the module's `TicketRow` and in `ticketRow`'s `SELECT`, in
  `createTicket`'s `INSERT`, and in `updateTicket`'s `UPDATE`.
- `server/routes.ts`: `colour?` in the two usage strings, so a 400 names the field.

**Code changes:**

```typescript
// core/board/schema.ts
export const CreateTicketRequest = z.strictObject({
  project: Id,
  column: Id.optional(),
  title: Title,
  description: Description.default(''),
  priority: PriorityName.default('none'),
  dueOn: DueOn.default(null),
  colour: Colour.default(null),
  labels: LabelIds.default([]),
})
export const UpdateTicketRequest = z
  .strictObject({
    id: Id,
    title: Title.optional(),
    description: Description.optional(),
    priority: PriorityName.optional(),
    dueOn: DueOn.optional(),
    colour: Colour.optional(),
    labels: LabelIds.optional(),
  })
  .refine((ticket) => Object.keys(ticket).length > 1, 'Name a field to change')
```

`{ id, colour: null }` has two keys, so it passes the refine.

```typescript
// core/board/tickets.ts, updateTicket
// Every column is written from the stored row with the named fields over it, so one fixed
// statement serves any mix of fields. dueOn or colour: null clears it; left out keeps it.
run(
  db,
  `UPDATE ticket SET title = ?, description = ?, priority = ?, due_on = ?, colour = ?
        WHERE id = ?`,
  request.title ?? ticket.title,
  request.description ?? ticket.description,
  request.priority ?? ticket.priority,
  request.dueOn === undefined ? ticket.due_on : request.dueOn,
  request.colour === undefined ? ticket.colour : request.colour,
  ticket.id,
)
```

```typescript
// server/routes.ts
'{ project, column?, title, description?, priority?, dueOn?, colour?, labels? }'
'{ id, title?, description?, priority?, dueOn?, colour?, labels? }'
```

`createTicket(request: z.output<typeof CreateTicketRequest>)` now needs `colour`, so the three
tests that call it with a whole request get `colour: null`: `tests/board.test.ts`'s `ticket()`
helper and its "Shared only" refusal (line 504), and `tests/board-sessions.test.ts`'s fixture
(line 50). The `ticket()` helper's `more` takes `colour?: BoardColour | null`. The page's
`createTicket` takes `z.input`, where `colour` is optional, so `new-ticket-dialog.tsx` compiles
unchanged.

**Tests:**

- Extend `tests/board.test.ts` › "an update changes only the fields it names; labels replace the
  set". Create the ticket with `colour: 'pink'`. The first update (title and priority) leaves it
  `'pink'`, and the second adds `colour: null` and clears it. That covers create's field, "left
  out keeps it" and "null clears it".
- Extend `tests/board-routes.test.ts` › "a project, a ticket, a move and a comment, read back over
  HTTP": `POST /api/board/tickets/update` with `{ id: 1, colour: 'yellow' }` answers 200
  `Saved BEANS-1`, and the ticket read after it has `colour: 'yellow'` (add `ticket.body.colour`
  to the list that test already compares). This is the ticket's update-route test.
- Mechanical: `CreateTicketRequest.parse(create)`'s expected value in "the request schemas refuse
  what the tables would otherwise hold" gains `colour: null`. A colour that isn't a swatch is
  already refused through the shared `Colour` (the `SaveColumnRequest` case): no new rule.

### Section 3: The MCP tools

**Files to modify:**

- `mcp/board-tools.ts`: `Colour` imported. `colour` goes on `card()`, on `board_create_ticket`'s
  input (`Colour.default(null)`) and on `board_update_ticket`'s (`Colour.optional()`). Three
  descriptions and the "name a field" refusal change.

**Code changes:**

```typescript
function card(ticket: TicketSummary) {
  return {
    key: ticket.key,
    title: ticket.title,
    priority: ticket.priority,
    colour: ticket.colour,
    dueOn: ticket.dueOn,
    overdue: ticket.overdue,
    labels: ticket.labels.map((label) => label.name),
    comments: ticket.commentCount,
  }
}
```

- `board_get_ticket`: "Read one ticket by its id (BEANS-3): its title, column, priority, colour,
  due date, labels, markdown description and comments, oldest first."
- `board_create_ticket`: `colour: Colour.default(null)` between `dueOn` and `labels`. The
  description gains "A colour, when given, tints its card on the board." before "Answers the new
  ticket's id."
- `board_update_ticket`: `colour: Colour.optional()`. The description becomes "Change a ticket's
  title, description, priority, due date, colour or labels. Only the fields named change; labels
  replace the ticket's whole set, and dueOn: null or colour: null clears it. It doesn't move the
  ticket: board_move_ticket does." The refusal becomes "Name a field to change: title,
  description, priority, dueOn, colour or labels". `colour` rides in `...changes`, and `null`
  isn't `undefined`, so `{ key, colour: null }` is a change.

`z.toJSONSchema(input, { io: 'input' })` lists `colour` as an enum of the 14 names or null, and
not required, so `create`'s `required` stays `['project', 'title']`.

**Tests:**

- Extend `tests/mcp.test.ts` › "a ticket is created, read, updated, moved and commented on by its
  key". Create BEANS-1 with `colour: 'yellow'`. The existing update (priority, dueOn) leaves it,
  and the `board_get_ticket` deep-equal gains `colour: 'yellow'`. Add
  `board_update_ticket { key: 'BEANS-2', colour: 'green' }` → `Saved BEANS-2`, then assert that
  `board_list_tickets` reports `'green'` on BEANS-2 (Backlog) and `'yellow'` on BEANS-1
  (In progress).
- Mechanical: the "name a field" refusal text in "arguments that fail a tool's schema…".

### Section 4: The sticky-note card

**Files to modify:**

- `web/components/ui/swatch-variants.ts`: `ring-swatch-<c>` on each `swatchSurface` entry, and
  its comment says "a border or ring width".
- `web/components/board/ticket-card.tsx`: its class list picks the look from `ticket.colour`. It
  imports `swatchSurface` and `cn` (`@/lib/utils.ts`), as `column-lane.tsx` does.

**Code changes:**

```typescript
// web/components/ui/swatch-variants.ts
// A surface in a swatch's colour that text and cards sit on: index.css's --color-swatch-*-surface
// (the swatch mixed into the card colour), with the swatch itself on any edge given a border or
// ring width.
export const swatchSurface = cva('', {
  variants: {
    colour: {
      red: 'bg-swatch-red-surface border-swatch-red ring-swatch-red',
      // ...the same for the other 13
    },
  },
})
```

```tsx
// web/components/board/ticket-card.tsx
// One ticket on the board, a sticky note in its colour when it has one. The whole card drags;
// its title opens it.
    <li
      data-ticket={ticket.id}
      draggable
      className={cn(
        'relative flex cursor-grab flex-col gap-1.5 rounded-lg p-2.5 ring-1 active:cursor-grabbing',
        ticket.colour === null
          ? 'bg-card ring-foreground/10'
          : swatchSurface({ colour: ticket.colour }),
      )}
    >
```

The pattern is `column-lane.tsx`'s (SM-10). The feature component maps the domain value to the
variant (`react-components.md` § Map domain values to variants in the feature component), and
the colours are theme tokens (§ Colour comes from the theme). `swatchSurface` has no `none` on
purpose, so the caller decides what "no colour" looks like: the plain card's classes stay as
they are.

**Tests:**

- None: no new rule. The page has no test suite. The gate is `mise run lint && mise run build`
  and the drive below.

### Section 5: The pickers

**Files to modify:**

- `web/components/board/board-actions.ts`: `setColour` on `TicketActions`.
- `web/components/board/board-view.tsx`: `setColour`, beside `setPriority`, as
  `(ticket, colour) => updateTicket({ id: ticket, colour })`.
- `web/components/board/ticket-card-menu.tsx`: `ColourMenu` (`@/components/ui/colour-menu.tsx`)
  after the Priority submenu.
- `web/components/board/ticket-properties.tsx`: a Colour field with `SwatchPicker`
  (`@/components/ui/swatch-picker.tsx`), after Priority. The component's comment names the
  colour.
- `web/hooks/use-ticket-mutations.ts`: the comment on the hook lists the colour among the
  changes made straight on the ticket.

**Type definitions:**

```typescript
// web/components/board/board-actions.ts
export interface TicketActions {
  move: (ticket: number, drop: Drop) => void
  setPriority: (ticket: number, priority: Priority) => void
  setColour: (ticket: number, colour: BoardColour | null) => void
  archive: (ticket: TicketSummary) => void
  remove: (ticket: TicketSummary) => void // asks first
  work: (ticket: TicketSummary) => void // asks where, then starts a session on it
}
```

**Code changes:**

```tsx
// web/components/board/ticket-card-menu.tsx, after the Priority DropdownMenuSub
<ColourMenu
  colour={ticket.colour ?? undefined}
  onPick={(colour) => actions.setColour(ticket.id, colour ?? null)}
/>
```

```tsx
// web/components/board/ticket-properties.tsx, after the Priority Field
<Field>
  <FieldLabel>Colour</FieldLabel>
  <SwatchPicker
    label="Colour"
    value={ticket.colour}
    onChange={(colour) =>
      colour !== ticket.colour && updateTicket({ id: ticket.id, colour })
    }
  />
</Field>
```

`Swatch` (`web/lib/swatches.ts`) and `BoardColour` are the same 14 names, so they assign both
ways, as they already do in `column-menu.tsx`. The menu's radio items stay open on a pick, as
the column menu's do, and the card behind updates once the board refreshes. `ColourMenu` and
`SwatchPicker` are `ui/` primitives taking `Swatch`, so neither imports from `core/`
(`react-components.md` § Where a Component Lives).

**Tests:**

- None: no new rule. The route and core tests in Sections 1 and 2 cover what the pickers send.

### Section 6: PLAN.md and README

**Files to modify:**

- `PLAN.md` § Ticket board: "A **ticket** has a title, a markdown description, a column, labels,
  a priority, an optional due date and colour, and comments."
- `README.md` § Ticket board: "A ticket has a markdown description, labels (…), a priority, a due
  date, a colour that tints its card, and comments".

**Tests:**

- None: no new rule.

## Config & Contract

- **Config:** none. `stack-monitor.json` doesn't change, so `mise run schema` and
  `examples/node-postgres.json` are untouched.
- **The board's file:** version 1 to 2. An existing file migrates the first time this version
  opens it and keeps everything. A file at version 2 refuses to open in an older monitor ("written
  by a newer stack monitor", `board-sqlite.md` § Consequences). So until this merges, a monitor
  from this branch must never open the user's real `board.db`: the drive uses copies only. What
  it keeps answers to PLAN.md § Principles, "Reads, doesn't remember": the board is the named
  exception, and a ticket's colour is something a person (or their agent) wrote, which the
  machine can't be asked for again.
- **Changed answers:** `TicketSummary` gains `colour`, and so do `TicketDetail` and
  `ArchivedTicket`. That reaches `GET /api/board/project`, `/api/board/ticket` and
  `/api/board/archived`. Readers: `ticket-card.tsx`, `ticket-card-menu.tsx` and
  `ticket-properties.tsx`. The change is additive.
- **Changed requests:** `POST /api/board/tickets/create` and `/update` take an optional `colour`.
  Every body they took before is still valid.
- **MCP tools** (a contract, `mcp-stdio-by-hand.md` § Consequences): `board_create_ticket` and
  `board_update_ticket` take an optional `colour`, and `board_get_ticket` and `board_list_tickets`
  answer `colour` on every ticket. Every call an agent made before still works. The update tool's
  "name a field" refusal text now lists `colour`. This goes on one line in the PR's Review notes,
  for an agent that may already call the tools.
- **Local only:** no new route. Both changed routes go through `route()` and the checks they had.

## Verification Checklist

- [ ] A version-1 `board.db` opens, migrates to `MIGRATIONS.length`, and keeps every ticket, each
      with no colour (test, and the drive on a copy)
- [ ] Create and update take `colour`; `null` clears it and leaving it out keeps it (tests)
- [ ] `board_create_ticket` and `board_update_ticket` set it; `board_get_ticket` and
      `board_list_tickets` report it (test)
- [ ] A coloured card shows its swatch's outline and tint; a card with no colour is
      pixel-for-pixel today's card, on a plain lane and on a coloured one
- [ ] The colour set from the card menu, the dialog, or `board_update_ticket` shows on the card
      after a reload
- [ ] `mise run check` passes
- [ ] No regressions: dragging a card, the card menu's other items, the dialog's other properties,
      creating a ticket from the new-ticket dialog, and column lane colours (SM-10)

### Browser drive

Scratch only: never port 7420, never `~/.local/state/stack-monitor/board.db`, and every command
that opens a board has `STACK_MONITOR_BOARD` set. `$S` below is
`/private/tmp/claude-501/-Users-koyo-mac-studio-Desktop-stack-monitor/2cf39fd9-add5-42ec-81cd-0f0aec3fe219/scratchpad`.
Playwright is at `$S/sm-2-drive/pw/` (1.65.1), and SM-10's drive scripts in `$S/sm-10-drive/scripts/`
show how to start the monitor and screenshot a lane.

1. **The old board.** Copy SM-10's seeded board:

   ```sh
   mkdir -p $S/sm-11-drive
   cp $S/sm-10-drive/board.seeded.db $S/sm-11-drive/old-board.db
   ```

   That file is version 1: project 1 (`LN`), 13 tickets, a plain Backlog with two cards, and a
   lane in each colour (In review is yellow). If it's gone, copy the real board without writing to
   it:

   ```sh
   sqlite3 -readonly ~/.local/state/stack-monitor/board.db ".backup '$S/sm-11-drive/old-board.db'"
   ```

   Record what the copy holds (expect `1` and N), and the real board's version (`1`):

   ```sh
   sqlite3 -readonly $S/sm-11-drive/old-board.db 'PRAGMA user_version; SELECT count(*) FROM ticket;'
   sqlite3 -readonly ~/.local/state/stack-monitor/board.db 'PRAGMA user_version;'
   ```

2. **Start:** `STACK_MONITOR_BOARD=$S/sm-11-drive/old-board.db STACK_MONITOR_PORT=7430 mise run dev`
   in the background, from the worktree.
3. **Migration:** open `http://127.0.0.1:7430/#/board?project=1`. Every lane and card from before
   is there, with no card coloured. This gives `2`, N, `0`:

   ```sh
   sqlite3 -readonly $S/sm-11-drive/old-board.db 'PRAGMA user_version;
     SELECT count(*) FROM ticket; SELECT count(*) FROM ticket WHERE colour IS NOT NULL;'
   ```

4. **Card menu:** on one of Backlog's two cards, open ⋯ → Colour → Yellow. The card turns into a
   yellow outline over a light yellow tint. Reload, and it's still yellow. Screenshot.
5. **On a coloured lane:** colour In review's card yellow (its lane's colour) and Done's card
   purple. Both still read as cards; the yellow one is told apart by its outline. A plain card on
   a coloured lane (Todo's) looks as it did before this branch. Screenshot each.
6. **Alignment:** in Backlog, the plain card and the yellow one have the same left and right
   edges and their text starts at the same inset. Compare `getBoundingClientRect` on the two
   `li[data-ticket]` and on their first child.
7. **Dialog:** open a card's title. In Properties, Colour shows the ticket's colour checked. Pick
   Blue: the card behind updates and the dialog stays open. Pick No colour, close the dialog, and
   the card is plain again.
8. **Keyboard:** Tab to a card's ⋯ button, Enter, arrow to Colour, Right to open it, pick with
   Enter. The colour shows.
9. **Themes:** step 5's screenshots in a light variety and a dark one (`midnight`, picked in the
   sidebar), so the outline and tint read in both.
10. **MCP:** pipe an `initialize` line and a `tools/call` of
    `board_update_ticket {"key": "<a key from step 3>", "colour": "green"}` into
    `STACK_MONITOR_BOARD=$S/sm-11-drive/old-board.db node mcp/main.ts`. It answers `Saved <key>`.
    Reload the page and the card is green; `board_get_ticket` through the same pipe shows
    `"colour": "green"`.
11. **Tear down:** stop the dev server. Check that the real board's `PRAGMA user_version` is still
    `1`.

Which tests cover what the page calls: `POST /api/board/tickets/update` and the reads, in
`tests/board-routes.test.ts` and `tests/board.test.ts`; the tools, in `tests/mcp.test.ts`.

## Open questions

- **Where a ticket's colour is kept.** Recommended: a column on `ticket` in `board.db`, as the
  ticket asks. A worktree's colour is kept per browser (`web/lib/checkout-prefs.ts`), and that
  would be lighter: no migration. But an agent couldn't set or read it through the tools, and the
  Electron window and a browser tab would each have their own (`board-sqlite.md` rejects
  `localStorage` for the board for the same reasons).
- **A stronger tint for cards than for lanes (SM-10's K2).** Recommended: no. Cards use the
  lane's `swatchSurface` strength, and nothing new goes in `index.css`.
  - The spec asks for a light tint.
  - A coloured card is set apart from its lane by its outline, at about the strength of a plain
    card's edge.
  - A second strength would be 14 more `color-mix` tokens, or SM-10's tokens rebuilt as one
    `@utility` (K2). That's a change to SM-10's open PR, and it stays a follow-up there.
  - If the drive's step 5 screenshots read too faint, the cheapest follow-up adds no tokens. The
    surface tokens sit in `@theme inline`, so the compiled `.bg-swatch-<c>-surface` carries
    `color-mix(in oklab, var(--swatch-<c>) var(--swatch-surface-mix), var(--card))` itself (checked
    by compiling `web/index.css`), and the mix resolves on the element. A card could set its own
    `--swatch-surface-mix` through one small `@utility` with a light and a dark value.
- **Outline as a ring or a border.** Recommended: the card's existing `ring-1`, coloured by
  `ring-swatch-<c>` added to `swatchSurface`. A `border` from `swatchSurface` as it stands would
  need `p-2.25` to keep the content inset, and it would still sit 1px inside a plain card's ring
  edge, so a lane's cards wouldn't line up. Changing the plain card to a border would change the
  card the spec says stays as it is.
- **The dialog's picker: `SwatchPicker` or `ColourMenu`.** Recommended: `SwatchPicker`. The
  ticket says to reuse `ColourMenu` "the way `column-menu.tsx:47` does", and the card menu does
  exactly that. `ColourMenu` is a `DropdownMenuSub` and needs a dropdown around it, while the
  dialog's properties are form fields. `SwatchPicker` is the same choice built for a form, and the
  column, project and label dialogs already use it.
- **A picker in the new-ticket dialog.** Recommended: not in this change. The ticket names the
  card menu and the ticket dialog, and leaves the new-ticket dialog out of scope. The route and
  `board_create_ticket` take `colour`, so the follow-up is one `Controller` with a `SwatchPicker`
  in `new-ticket-dialog.tsx`, as `column-dialog.tsx` has.
- **The card menu closing on a pick.** Recommended: leave `ColourMenu` as it is. It stays open,
  as it does in the column menu, while the card menu's Priority items pass `closeOnClick`. Making
  `ColourMenu` close would change the column, worktree, PR and tab menus too. It's one prop if
  the user wants it.
- **The action's name.** Recommended: `setColour(ticket, colour)`, matching `setPriority` beside
  it in `TicketActions`. `ColumnActions.recolour` takes the whole column, because saving a column
  needs its name.
- **Saying the colour to a screen reader on the card.** Recommended: no, as for a column's or a
  label's colour. The checked radio in the menu and in the picker names it.

## Style Guide Suggestions

- **Which swatch variant for what.** `swatch-variants.ts` now holds `swatchFill` (a dot), `swatchTint`
  (a hoverable row, see-through) and `swatchSurface` (an opaque surface with its edge colour: a
  lane, a card). No guide says when to use which, and a fourth look is easy to add by mistake.
  Suggest a short table in `react-components.md` § Colour comes from the theme, with each
  variant's job and the rule that a caller decides what "no colour" looks like
  (`swatchSurface` has no `none`).
