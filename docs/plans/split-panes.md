# Feature: Split panes

## Overview

The page becomes a split layout like iTerm or cmux. The routed page (Worktrees, GitHub, Agents…)
and any number of terminal panes sit in one tree of splits. Every divider drags, and each terminal
pane has its own tab strip of sessions. Tabs can be renamed, coloured, split, moved and dragged.
The sidebar is regrouped under headings, with a row per live session in place of the Terminal
button. The fixed right-hand panel (`web/components/terminals/terminal-panel.tsx`) goes away.

Everything changes in `web/` (plus one menu change in `app/main.ts`, see Open questions). The server
already runs any number of sessions with a socket each, and nothing it answers changes.

## Requirements

- **The page is a pane.** There is exactly one page leaf in the tree. It sits left, right, above or
  below any terminal pane. It can be hidden but never duplicated. Clicking a page link in the
  sidebar shows it again.
- **Splits.** Rows and columns nest to any depth. Every divider drags and has keyboard resizing
  (react-resizable-panels' `Separator`).
- **Tabs per pane.** Each terminal pane has an ordered tab strip and one active tab. Closing a
  pane's last tab removes the pane, and its neighbour takes the space. A split with one child left
  collapses into that child.
- **Where a new session lands:**
  - A worktree's claude session that is already open is activated wherever it is.
  - A new session lands as a tab in the focused terminal pane.
  - With no terminal pane, it lands in a new pane right of the page at 40%, which is today's width.
- **Tab menu**, from right-click (and the Context Menu key or Shift+F10) and from a ⋯ button on the
  tab: Rename, Colour, Split right, Split down, Move to new pane, Close. Double-clicking a tab
  renames it inline.
  - **Split right/down** open a new shell in the tab's worktree, in a new pane on that side, as
    iTerm's ⌘D does. "Move to new pane" moves the tab itself into a new pane on the right.
- **Colour** comes from the swatch palette the worktree rows already use (`--swatch-*` in
  `web/index.css`), plus none. It tints the tab and the tab's row in the sidebar.
- **Pane menu** (⋯ at the end of each pane's strip): put the page left, right, above or below this
  pane; hide the page; a new shell in this pane.
- **Drag and drop**: drag a tab onto another pane's strip to move it there (at the drop index), onto
  a pane's centre to move it into that pane, or onto any pane's edge to split it. The page pane's
  edges count too.
- **Shortcuts** act on the focused terminal pane. They reach the page from inside xterm, and they
  don't take keys a terminal needs: Ctrl combos stay the program's.

  | Keys          | Action                                  |
  | ------------- | --------------------------------------- |
  | ⌘D            | split right (a new shell)               |
  | ⌘⇧D           | split down                              |
  | ⌘W            | close the active tab (focus in a pane)  |
  | ⌘⌥ arrow keys | focus the pane on that side, page too   |
  | ⌘⇧[ / ⌘⇧]     | previous / next tab in the focused pane |
  | ⌘B            | the sidebar, unchanged                  |

- **Sidebar**, grouped:
  - "Stack monitor"
  - WORK: Worktrees, GitHub
  - AUTOMATION: Agents, Schedules
  - SESSIONS: one row per session (beaver or `>_`, busy, exited dimmed, the tab's name and colour).
    The heading carries the show/hide-terminals toggle and the running count. Clicking a row shows
    the terminals if they were hidden, then activates the row's tab and focuses its pane.
  - Settings at the bottom, beside the theme button and the collapse toggle.

  The collapsed rail (`md:w-14`, icons with tooltips) keeps working: headings become a separator,
  and session rows become icons with their name as a tooltip.

- **Narrow screens** (below `md`): no splits. The page fills the screen. Showing the terminals opens
  today's full-screen overlay, which shows the focused pane with one strip of every session in tree
  order.
- **Switching layout keeps state.** Splitting, moving or hiding a pane never remounts a terminal (no
  reconnect, no replay) or the page (scroll, open dialogs and local state survive).
- **Persistence** (phase 6; see Open questions): the tree, sizes, focus, hidden flags, and tab
  names and colours are kept in `localStorage` per browser. Session ids that `GET /api/terminals`
  no longer lists are dropped on load.

## Technical Approach

**The tree is a plain value with pure operations.** `web/lib/pane-layout.ts` holds the types and
every operation as a `(layout, …) => layout` function, with no React and no DOM. It's tested with
`node:test` in `tests/`, as `tests/checkout-order.test.ts` already tests `web/lib/checkout-order.ts`.
The provider holds one `useState<PaneLayout>` and applies the operations to it.

**What's rendered is derived, not synced.** Each render computes
`reconcile(stored, sessionIds)`: it drops ids the server no longer lists, and puts each listed
session that isn't in a pane into the focused pane (or a new one). It then computes
`visibleTree(…)`, which drops hidden leaves and collapses splits. There's no effect that copies
sessions into the tree (`react-hooks.md` § Derive, Don't Store). `useTerminals`' `open` mutation
already awaits its refetch (`onSettled` returns the invalidation), so a session `openFor` just
opened is in `sessions` by the time the placement runs.

**Terminals and the page are rendered once and moved, not remounted.** A split wraps a pane in a
new group, which changes its place in the React tree, and React would remount whatever is inside.
For a terminal, a remount means a new socket and a 256 kB scrollback replay into a fresh xterm. For
the page, it means losing its scroll and local state. So:

- `web/lib/held-elements.ts` keeps one detached `<div>` per key (`'page'`, or a session id).
- The shell renders `createPortal(<Outlet />, held('page'))` and one
  `createPortal(<TerminalView …/>, held(session.id))` per session, in a flat list whose position
  never changes.
- Each pane's body is a `PaneSlot` that appends the held element in a layout effect and detaches it
  in the cleanup.

A tab that isn't active is detached. Its `clientWidth` is 0, so `TerminalView`'s existing `refit`
skips it, and its `ResizeObserver` fits it when it's attached again. This is the reverse-portal
pattern, written in about 30 lines rather than taken as a dependency.

Two consequences shape the code:

- **React events from a terminal or the page bubble to the shell, not to the pane around them.** A
  pane learns that it was clicked or focused from native `focusin` and `pointerdown` listeners on
  its container, which the DOM does reach. A React `onFocus` there would never fire.
- **`visible` on `TerminalView` becomes `focused`**: the active tab of the focused pane takes
  keyboard focus. The `hidden` class goes, since a hidden tab is detached instead.

**react-resizable-panels v4 through shadcn** (`npx shadcn@4.23.0 add resizable`). The registry
item for `base-lyra` wraps v4's `Group` / `Panel` / `Separator` with `orientation`, and it depends on
`react-resizable-panels`.

- `PaneTree` renders a split node as a `ResizablePanelGroup` whose children are `ResizablePanel`s
  keyed and `id`'d by node id, with `defaultSize` taken from the node's `sizes`.
- Sizes are written back to the tree only when a drag ends, so the provider doesn't re-render on
  every pointer move. Use v4's end-of-change callback; check its name and its size units
  (percentages or pixels) in the package README when adding it.
- A decision record goes with it (Section 2).

**Drag and drop is native HTML5**, as the worktree rows already do it (`repo-section.tsx`).

- A tab is `draggable` and carries its session id under a custom type
  (`application/x-stack-monitor-session`).
- While a drag is on, every pane gets an overlay above its body. The overlay catches `dragover`
  over the xterm canvas and the page, and shows the zone under the pointer.
- `dropZone(rect, point)` in `pane-layout.ts` maps the pointer to one of the four edges (the outer
  quarter on each side) or to the centre.
- The keyboard path for every move is the tab and pane menus.

**Shortcuts.**

- `paneCommand(event)` in `web/lib/pane-shortcuts.ts` turns a key event into a command, or into
  `null`. It's pure and tested.
- `TerminalView` calls `term.attachCustomKeyEventHandler((event) => paneCommand(event) === null)`.
  Without it, xterm turns ⌘⌥← into `CSI 1;10D` and stops the event.
- `usePaneShortcuts` (in `web/hooks/`) listens on `window` and runs the command. Inside an
  `<input>` or `<textarea>` it does nothing, unless the field is in `.xterm`.
- Only ⌘ (`metaKey`) counts, never Ctrl. Ctrl+D and Ctrl+W are EOF and delete-word in a shell.

Keys are matched on `event.code` (`KeyD`, `BracketLeft`), since ⇧ turns `[` into `{`.

**Browsers keep some of these keys.** Chrome and Safari keep ⌘W, ⌘⌥←/→ and ⌘⇧[ / ⌘⇧] for their own
tabs, and a page never sees them. Those keys work in the desktop app only. In a browser the tab's ✕,
its menu and the pane menu do the same. In the app, Electron's default menu holds ⌘W for Close
Window (`app/main.ts` sets no menu), so the app needs a menu whose Close is ⌘⇧W (Open questions).

**Menus use the existing `DropdownMenu`.** One controlled menu per tab opens from the ⋯ button or
from `onContextMenu`. A right-click anchors it at the pointer through Base UI's `Positioner`
`anchor` prop, which `DropdownMenuContent` passes through once `'anchor'` is added to its `Pick`.
The keyboard Context Menu key fires the same `contextmenu` event, and the menu then anchors at the
tab. `ColourMenu` moves from `worktree-row.tsx` to `ui/` now that a second feature needs it
(`react-components.md` § Where a Component Lives). This avoids a second menu primitive
(`shadcn add context-menu`) and a second copy of the items.

**One provider, larger.** `TerminalProvider` keeps sessions, busy, `openFor` and close, and gains
the layout. Its body moves into `providers/use-terminal-provider-state.ts`
(`react-providers.md` § A large value moves into a hook). The accessor `useTerminalPanel` becomes
`useTerminalLayout`, since there's no panel any more. The layout changes only on user actions and on
drag end, never per frame, so one context is cheap enough (`react-providers.md` § What Belongs in a
Provider).

**Where each caller lands:**

| Caller (today)                                                  | New model                                                                                                              |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `repo-section.tsx` beaver → `openFor({root, path})`             | an open claude session's tab is activated where it is; else a tab in the focused pane, or a new pane right of the page |
| `repo-section.tsx` ⋯ Open a terminal here → `openFor({…shell})` | a new tab in the focused pane (same rule)                                                                              |
| `repo-section.tsx` `terminalState(sessions, busy)`              | unchanged: reads `sessions` and `busy`                                                                                 |
| `terminal-panel.tsx` + (new shell in current's worktree)        | the pane menu's "New shell here": a tab in that pane                                                                   |
| `terminal-panel.tsx` ✕ → `close(id)`                            | the tab's ✕, the menu's Close and ⌘W → `close(id)`; the tab leaves its pane                                            |
| `sidebar.tsx` `TerminalButton` → `setShown`                     | the Sessions heading toggle → `setHidden('terminals', …)`                                                              |
| `terminal-view.tsx` `setBusy`                                   | unchanged                                                                                                              |

**Server: no change.** `core/terminals/sessions.ts` runs any number of sessions, and each socket is
a viewer (`viewers: Set`). There is still one view per session, so there's one size per pty and
nothing to arbitrate. A split's new shell is `POST /api/terminals` with `kind: 'shell'`. Names,
colours and layout are one browser's arrangement, like the checkout prefs, so they stay out of the
server (PLAN.md § Principles, "Reads, doesn't remember").

## Implementation Sections

Each section is one reviewable commit. Each ends with `mise run lint && mise run build`, plus
`mise run test` once `tests/` changes, and a look at the page in `STACK_MONITOR_PORT=7430 mise run dev`.

### Section 1: Sidebar regroup

**Files to modify/create:**

- `web/components/layouts/sidebar.tsx`: `LINKS` becomes
  `GROUPS: { heading: 'Work' | 'Automation'; links: … }[]`. Each group renders under an `<h2>` that
  is `md:sr-only` when collapsed, with a `Separator` shown in its place. Settings moves into the
  bottom block beside `ThemeButton` and the collapse toggle. On a narrow screen that block is
  hidden, so a second Settings link at the end of the link row is `md:hidden`. `TerminalButton`
  goes.
- `web/components/terminals/session-list.tsx` (new): the SESSIONS group. Its heading holds a
  toggle button (`aria-pressed`, labelled "Show the terminals" / "Hide the terminals", with the
  running count as today) and a `ul` of session buttons. Each button has the beaver or `Terminal`
  icon and the label, with `aria-current` on the active session of the focused pane. Exited
  sessions are dimmed with "(exited)" for screen readers, as the tabs do today. Collapsed, each row
  is an icon in a `Tip`. With no sessions, the toggle is disabled and the expanded list says "None
  yet: click the beaver on a worktree", which moves here from the panel's empty state.
- `web/lib/session-label.ts` (new): `sessionLabel(session, style?)`. It returns the tab's own name,
  else the worktree's nickname from `readPrefs()`, else the folder name. This is `label()` lifted
  out of `terminal-panel.tsx`.

In this commit a row's click calls today's `setShown(true)` + `setActive(id)`, so the section ships
on its own against the current panel. The middle of the nav scrolls (`md:overflow-y-auto`) when
sessions outgrow it.

**Tests:** None: no new rule (the page has no component tests; `mise run lint && mise run build`).

### Section 2: The layout tree, Resizable, the page and one terminal pane

**Files to modify/create:**

- `web/lib/pane-layout.ts` (new): the types and the pure operations below.
- `web/lib/held-elements.ts` (new): `held(key): HTMLDivElement` (created on first ask, classed
  `flex min-h-0 flex-1 flex-col`) and `release(key)`.
- `web/components/ui/resizable.tsx` (new, `npx shadcn@4.23.0 add resizable`, then
  `mise run format`, `.ts`/`.tsx` imports and `cn` from `@/lib/utils.ts`).
- `web/components/panes/pane-tree.tsx`: renders a node recursively. A split becomes a
  `ResizablePanelGroup` with `ResizableHandle`s, and a leaf becomes `PagePane` or `TerminalPane`.
- `web/components/panes/pane-slot.tsx`: adopts `held(key)` in `useLayoutEffect`.
- `web/components/panes/page-pane.tsx`: a `PaneSlot` for `'page'` in an `overflow-y-auto`
  container. The container keeps today's `<main>` padding and `max-w-6xl`, so `pull-view.tsx`'s
  `-mx-4 -mt-6` sticky header still lines up.
- `web/components/panes/terminal-pane.tsx`: the tab strip (`role="tablist"`, `aria-label`
  "Terminals N") over a `PaneSlot` for the active tab (`role="tabpanel"`, `aria-labelledby` its
  tab). It has native `focusin`/`pointerdown` listeners that call `focusPane(id)`.
- `web/components/panes/pane-tab.tsx`: one tab. It's the existing tab markup from
  `terminal-panel.tsx` with roving focus (←/→, Home, End) across its strip.
- `web/components/panes/narrow-panes.tsx`: below `md`, the page slot, and the overlay with the
  focused pane's slot and a strip of all sessions.
- `web/components/layouts/app-shell.tsx`: the shell becomes `flex h-dvh` (the page scrolls inside
  its pane, not the document). It renders `Sidebar`, then `PaneTree` or `NarrowPanes` depending on
  `useMediaQuery('(min-width: 48rem)')`, then the portals (the page and every session's
  `TerminalView`).
- `web/hooks/use-media-query.ts` (new): `useSyncExternalStore` over `matchMedia`, which it takes as
  a parameter (`react-hooks.md` § Inject What's Impure is this hook's own example).
- `web/providers/terminal-provider.tsx` → three lines over
  `web/providers/use-terminal-provider-state.ts` (new).
- `web/contexts/terminal-context.ts`: the new value, with the accessor renamed `useTerminalLayout`.
  `repo-section.tsx`, `session-list.tsx` and `terminal-view.tsx` follow the rename.
- `web/components/terminals/terminal-view.tsx`: `visible` → `focused`, and the `hidden` class
  goes.
- `web/components/terminals/terminal-panel.tsx`: deleted.
- `docs/decisions/ui-resizable-panels.md` (new) and its row in `docs/decisions/README.md`.
  - Context: the page needs nested, draggable, keyboard-resizable splits.
  - Decision: react-resizable-panels v4 through shadcn's `resizable`. Our tree is the source of
    truth, and the library only lays it out. Terminals and the page are held elements moved between
    panes.
  - Alternatives rejected:
    - The hand-rolled drag in `terminal-panel.tsx`: no nesting, no keyboard, no separator roles.
    - Docking libraries such as dockview, FlexLayout and golden-layout bring their own tabs, DnD
      and look, which `ui-shadcn-base-ui-tailwind.md` already rejects.
    - allotment: no shadcn item, and a second styling story.
    - Remounting on every layout change.
  - Consequences: React events don't bubble from a held element to its pane, and v4's API is what
    `resizable.tsx` wraps.

**Type definitions** (`web/lib/pane-layout.ts`):

```ts
export type Edge = 'left' | 'right' | 'top' | 'bottom'
export type DropZone = Edge | 'centre'

export interface PageLeaf {
  kind: 'page'
  id: 'page'
}

export interface TerminalLeaf {
  kind: 'terminals'
  id: string
  tabs: string[] // session ids, never empty
  active: string // one of tabs
}

export interface SplitNode {
  kind: 'split'
  id: string
  direction: 'row' | 'column' // row: side by side
  children: LayoutNode[] // two or more
  sizes: number[] // percentages, one per child, summing to 100
}

export type LayoutNode = PageLeaf | TerminalLeaf | SplitNode

export interface PaneLayout {
  root: LayoutNode
  focused: string | null // the terminal pane shortcuts and new sessions go to
  pageHidden: boolean
  terminalsHidden: boolean
}

export interface TabStyle {
  name?: string
  colour?: Swatch
}
export type TabStyles = Record<string, TabStyle> // by session id
```

**Operations.** Each one returns its input unchanged when nothing moves, so React skips the render.
Ids for new nodes come from an injected `newId: () => string` (`crypto.randomUUID` in the
provider), so tests are deterministic.

```ts
export const DEFAULT_LAYOUT: PaneLayout
export function reconcile(
  layout: PaneLayout,
  sessionIds: readonly string[],
  newId: NewId,
): PaneLayout
export function placeSession(
  layout: PaneLayout,
  id: string,
  newId: NewId,
): PaneLayout
export function insertAt(
  layout: PaneLayout,
  beside: string,
  edge: Edge,
  leaf: TerminalLeaf | PageLeaf,
): PaneLayout
export function removeSession(layout: PaneLayout, id: string): PaneLayout
export function moveTab(
  layout: PaneLayout,
  id: string,
  to: { pane: string; index: number } | { beside: string; edge: Edge },
  newId: NewId,
): PaneLayout
export function movePage(
  layout: PaneLayout,
  beside: string,
  edge: Edge,
): PaneLayout
export function activate(layout: PaneLayout, id: string): PaneLayout // its pane focused, terminals shown
export function cycleTab(layout: PaneLayout, step: 1 | -1): PaneLayout
export function setSizes(
  layout: PaneLayout,
  splitId: string,
  sizes: number[],
): PaneLayout
export function setHidden(
  layout: PaneLayout,
  part: 'page' | 'terminals',
  hidden: boolean,
): PaneLayout
export function visibleTree(layout: PaneLayout): LayoutNode
export function neighbour(
  root: LayoutNode,
  from: string,
  edge: Edge,
): string | null
export function dropZone(rect: Rect, point: { x: number; y: number }): DropZone
```

The rules the code has to get right:

- **`insertAt`.** When the parent split runs along the edge's axis (`left`/`right` in a `row`), the
  new leaf becomes a sibling and takes half of `beside`'s share. Otherwise `beside` is wrapped in a
  new two-child split at 50/50.
- **`removeSession`.**
  - An emptied pane's share goes to the sibling before it, or to the one after when it was first.
  - A split left with one child is replaced by that child, and the child takes the split's place
    and share.
  - When the removed tab was active, the next tab takes over, else the previous one.
  - Focus moves to the nearest remaining terminal pane, else `null`.
- **`moveTab`.** Dropping a pane's only tab on that pane's own edge or centre is a no-op.
- **`setHidden`.** Both parts can't be hidden at once: hiding one shows the other. The terminals
  can't be hidden with no terminal pane, and the page can't be hidden then either.
- **`neighbour`.** It lays the visible tree out in a unit box from `sizes`, then picks the leaf
  across `from`'s edge that overlaps it most, with ties going to the top or left. It's pure
  geometry, with no DOM.

**Context value** (`web/contexts/terminal-context.ts`):

```ts
export interface TerminalContextValue {
  sessions: TerminalSession[]
  busy: ReadonlySet<string>
  setBusy: (id: string, busy: boolean) => void
  layout: PaneLayout // reconciled against sessions
  tabStyles: TabStyles
  openFor: (
    target: TerminalTarget,
    where?: { beside: string; edge: Edge },
  ) => void
  close: (id: string) => void
  focusSession: (id: string) => void
  focusPane: (pane: string) => void
  split: (pane: string, edge: 'right' | 'bottom') => void // a new shell in its active tab's worktree
  moveTab: (
    id: string,
    to: { pane: string; index: number } | { beside: string; edge: Edge },
  ) => void
  movePage: (beside: string, edge: Edge) => void
  cycleTab: (step: 1 | -1) => void
  setSizes: (split: string, sizes: number[]) => void
  setHidden: (part: 'page' | 'terminals', hidden: boolean) => void
  styleTab: (id: string, style: TabStyle) => void
}
```

In this section only `openFor`, `close`, `focusSession`, `focusPane`, `setSizes` and `setHidden`
have callers. The rest arrive with their sections. A sidebar page link calls
`setHidden('page', false)` in its `onClick`.

**Tests:** `tests/pane-layout.test.ts` (new), one test per rule:

- `placeSession` puts a new id in the focused pane, activates an id already placed, and makes a
  pane right of the page when there's none.
- `insertAt` adds a sibling along the parent's axis and wraps across it, halving the share.
- `removeSession`: the last tab removes its pane, the neighbour takes its size, a one-child split
  collapses, and focus moves.
- `reconcile` drops ids no longer listed and places listed ones that aren't placed.
- `setHidden` never hides both parts, nor the page with no terminal pane.
- `visibleTree` drops hidden leaves and renormalises sizes.

### Section 3: Splits, focus and shortcuts

**Files to modify/create:**

- `web/lib/pane-shortcuts.ts` (new): `paneCommand(event)` → `PaneCommand | null`, from a table over
  `code` and modifiers.
- `web/hooks/use-pane-shortcuts.ts` (new): the `window` listener. It runs each command through
  the context, and `preventDefault`s only what it ran. ⌘W runs only when `document.activeElement`
  is inside a `[data-pane-kind="terminals"]`. ⌘⌥ arrows find the pane holding focus through
  `closest('[data-pane-id]')`, ask `neighbour`, and focus the target pane (its active xterm, or the
  page container, which has `tabIndex={-1}`). Called once in `AppShell`.
- `web/lib/keys.ts` (new): `typingInField(target)`, the shared form of `use-sidebar-state.ts`'s
  private `typing`. The sidebar keeps ignoring `.xterm` and the pane shortcuts don't; both use the
  helper with that one difference as a parameter.
- `terminal-view.tsx`: `attachCustomKeyEventHandler` as above.
- `terminal-pane.tsx`: the pane ⋯ menu (page left/right/above/below, hide the page, new shell
  here) and a "New shell here" `+` beside it, as today's panel has.
- `app/main.ts` (if the Open question goes that way): `Menu.setApplicationMenu` with the default
  roles, but Close Window on ⌘⇧W so ⌘W reaches the page.

```ts
export type PaneCommand =
  | { type: 'split'; edge: 'right' | 'bottom' }
  | { type: 'close-tab' }
  | { type: 'focus'; edge: Edge }
  | { type: 'cycle-tab'; step: 1 | -1 }
```

**Tests:**

- `tests/pane-shortcuts.test.ts` (new): one test that loops over the key table (⌘D, ⌘⇧D, ⌘W,
  ⌘⌥ each arrow, ⌘⇧[ / ⌘⇧]) and over keys that must stay the terminal's (Ctrl+D, Ctrl+W, ⌥←,
  plain D), giving `null` for those.
- `tests/pane-layout.test.ts`: a case for `neighbour` on a nested layout (across a split, ties to
  the top or left, `null` at the outer edge), and one for `movePage`, which keeps exactly one page
  leaf.

### Section 4: Tab menu, rename, colour

**Files to modify/create:**

- `web/lib/swatches.ts` (new): `SWATCHES` and `Swatch`, moved out of `checkout-prefs.ts`, which
  imports them.
- `web/components/ui/colour-menu.tsx` (new): `ColourMenu`, moved from `worktree-row.tsx` without
  changes. `worktree-row.tsx` imports it.
- `web/components/ui/dropdown-menu.tsx`: `'anchor'` added to `DropdownMenuContent`'s `Pick` and
  passed to the `Positioner`.
- `pane-tab.tsx`: a controlled `DropdownMenu`. `onContextMenu` calls `preventDefault`, records the
  anchor (the pointer, or the tab's rect when the event came from the keyboard, i.e.
  `clientX === 0 && clientY === 0`) and opens the menu. The ⋯ button is shown on the active tab
  and on hover or focus. Items: Rename, `ColourMenu`, Split right, Split down, Move to new pane,
  separator, Close (`variant="destructive"`). Double-click or Rename swaps the label for a private
  `TabNameField` (an `Input`, where Enter or blur saves, Escape cancels, and empty clears). The
  tab takes `swatchTint({ colour })` from `ui/swatch-variants.ts`.
- `session-list.tsx`: each row takes `swatchTint` and `sessionLabel(session, tabStyles[id])`.

**Tests:** None: no new rule (`styleTab` is a record update in the provider and adds no operation).

### Section 5: Drag and drop

**Files to modify/create:**

- `web/components/panes/drop-overlay.tsx` (new): absolutely placed over a pane's body, rendered
  only while `dragging !== null`. It works out the zone with `dropZone` on `dragover`, shows the
  half or the whole of the pane it would fill (`bg-primary/15`, the colour the current drag handle
  uses), and calls `moveTab` on drop. The zone is local state, so highlighting re-renders only that
  overlay.
- `pane-tab.tsx`: `draggable`. `onDragStart` sets the session type and `onDragEnd` clears it. The
  strip computes the drop index from the tabs' rects and draws an insertion bar, the way
  `repo-section.tsx` draws its drop line.
- `pane-tree.tsx`: holds `dragging: string | null` in `useState` and passes it down. It's state
  one subtree needs (`react-providers.md` § What Belongs in a Provider), so it stays out of the
  context.

**Tests:** `tests/pane-layout.test.ts`: a case for `dropZone` (each edge's outer quarter, the
centre, corners going to the nearer edge), and one for `moveTab`, where dropping a pane's only tab
on itself changes nothing and moving the last tab out removes its pane.

### Section 6: Persistence

**Files to modify/create:**

- `web/lib/pane-layout-store.ts` (new): `readLayout(): { layout: PaneLayout; tabStyles: TabStyles }`
  and `storeLayout(…)` under `stack-monitor:pane-layout`, using the `try`/`catch` and
  `readJson`/`writeJson` shape of `checkout-prefs.ts`. `parseLayout` checks every invariant (one
  page leaf, no empty pane, sizes matching children, a known swatch) and falls back to
  `DEFAULT_LAYOUT` for anything it can't read. It also drops `stack-monitor:terminal-width`, which
  nothing reads any more.
- `use-terminal-provider-state.ts`: `useState(() => readLayout())`, and `storeLayout` in each
  action (`react-providers.md` § Expose actions, not raw setters). It stores the reconciled layout,
  so dead ids leave storage the first time anything changes. There's no cross-tab sync: two tabs
  arranging panes would fight.

**Tests:** `tests/pane-layout.test.ts`: `parseLayout` over a list of bad inputs (not JSON, two page
leaves, an empty pane, sizes of the wrong length, an unknown swatch) gives the default. One test
loops over them.

## Config & Contract

- No config change, no route or `core/types.ts` change, no MCP change. The page keeps calling
  `GET/POST /api/terminals`, `POST /api/terminals/close` and the socket, which
  `tests/terminals.test.ts` covers.
- Kept state: the layout and tab names and colours live in one browser's `localStorage`, as the
  checkout prefs do. The monitor itself starts keeping nothing (PLAN.md § Principles, "Reads,
  doesn't remember").
- No new command and no new signal. Close is today's `POST /api/terminals/close` (SIGHUP), reached
  from more places, ⌘W among them.

## Verification Checklist

In `STACK_MONITOR_PORT=7430 mise run dev`, at `http://127.0.0.1:7430`, and in `mise run app` for
the app-only keys:

- [ ] Sidebar shows WORK, AUTOMATION, SESSIONS and Settings at the bottom. Collapsed, it's a rail
      with tooltips, and ⌘B still toggles it outside a terminal.
- [ ] A worktree's beaver opens claude beside the page. A second click activates the same tab, and
      "Open a terminal here" adds a tab to the focused pane.
- [ ] ⌘D and ⌘⇧D split with a new shell. Typing `ls` in each pane and splitting again keeps each
      one's output: no "Lost the monitor", no replay flash.
- [ ] Dividers drag, and arrow keys move a focused divider.
- [ ] Moving the page left, right, above and below a pane keeps the page's scroll and an open
      GitHub PR.
- [ ] Closing a pane's last tab removes the pane, and its neighbour fills the space.
- [ ] ⌘⌥ arrows move focus between panes including the page, and ⌘⇧[ / ⌘⇧] cycle tabs (app).
- [ ] Ctrl+D still ends a shell and Ctrl+W still deletes a word.
- [ ] Rename by double-click and from the menu. A colour tints the tab and its sidebar row.
- [ ] Dragging a tab works onto another strip, a pane's centre, a pane's edge and the page's edge.
- [ ] Narrow window: no splits, and the overlay shows every session.
- [ ] Reload: the layout, names and colours come back, and a session closed elsewhere is gone.
- [ ] Theme switch (light, dark, pastel): tabs, tints, handles and overlays read in each.
- [ ] `mise run check` passes.

## Decisions

Settled with the user on 2026-11-27, each the recommended option:

- **Persistence:** `localStorage` per browser (Section 6), stale ids pruned against
  `GET /api/terminals`. The server stays as it is.
- **Moving content without remounting:** held elements and portals (`web/lib/held-elements.ts`),
  no `react-reverse-portal`.
- **⌘W in the app:** `app/main.ts` sets an application menu with Close Window on ⌘⇧W, so ⌘W
  closes a tab.
- **Closing a running claude session** asks first through an `AlertDialog`, from every close
  path. Shells close straight away.
- Defaults kept: native HTML5 drag and drop; the page moves through the pane menu and by dragging
  tabs onto its edges; tab colour defaults to none, from the existing 14 swatches; the page pane
  gets a minimum size, with container queries left as a follow-up issue; the hand-written tablist
  is extended rather than adding shadcn `tabs`.

## Style Guide Suggestions

- **Events from portalled content**: nothing says that React events bubble through the React tree,
  not the DOM. Once held elements exist, a guide line in `react-components.md` should say to listen
  natively on a container whose content is moved in.
- **Keyboard shortcuts**: `use-sidebar-state.ts` and the new `use-pane-shortcuts.ts` both own a
  global key listener. A short section in `react-hooks.md` should cover them: ⌘ only on macOS,
  match on `event.code`, leave fields alone, and keys a terminal needs pass through xterm's custom
  key handler.
