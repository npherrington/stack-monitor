# Split panes through react-resizable-panels

**Status:** Accepted — 2026-11

## Context

The page and the terminals share the screen as a tree of splits, as iTerm and cmux do: the routed
page is one pane, and any number of terminal panes, each with its own tabs, sit left, right, above
or below it. Every divider drags and has to be resizable from the keyboard, with a separator's
role and value. The old Terminal panel was one hand-dragged edge on a fixed right-hand column, with
no nesting and no keyboard resizing.

Splitting a pane changes where it sits in the tree, which React would answer by remounting what is
in it. For a terminal that means a new socket and a replay of its scrollback; for the page, its
scroll and local state lost.

## Decision

**react-resizable-panels v4, through shadcn's `resizable` item** (`web/components/ui/resizable.tsx`).

- Our tree (`web/lib/pane-layout.ts`) is the source of truth: splits, sizes, tabs, focus. The
  library only lays a split out. A group starts from the tree's sizes (`defaultLayout`) and writes
  them back when a drag ends (`onLayoutChanged`), and it is keyed by its children, so a pane
  joining or leaving lays it out afresh from the tree.
- The page and each session's terminal render once, portalled into a detached element per key
  (`web/lib/held-elements.ts`); the pane that shows one adopts that element in a layout effect.
  Moving a pane moves the element, and nothing in it remounts.

## Alternatives rejected

- **Extending the panel's hand-written drag**: no nesting, no keyboard resizing, no separator
  semantics, and every one of those would be ours to keep.
- **A docking library (dockview, FlexLayout, golden-layout)**: each brings its own tabs, drag and
  drop and look, a second component system beside shadcn on Base UI
  ([ui-shadcn-base-ui-tailwind.md](ui-shadcn-base-ui-tailwind.md)).
- **allotment**: a split view without a shadcn item, styled its own way.
- **`react-reverse-portal` for moving content**: does what `held-elements.ts` does in about thirty
  lines, as one more dependency.
- **Letting React remount on every layout change**: every split would reconnect every terminal it
  touched and reset the page.

## Consequences

- `react-resizable-panels` is a page dependency; `resizable.tsx` wraps v4's `Group`, `Panel` and
  `Separator`, so a major version change touches that file and `pane-tree.tsx`.
- React events from the page or a terminal bubble to the workspace that portals them, not to the
  pane around them. A pane that needs to know it was clicked or focused listens natively.
- Tab dragging is native HTML5 drag and drop, as the worktree list's is; touch dragging isn't
  supported, and narrow screens have no splits.
