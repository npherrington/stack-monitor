# Feature: Stack map page

## Overview

PLAN.md's Feature map module (step 5), so far only the `featureMap.blocks` config key, becomes a
page: **Stack map**, in the sidebar's Product management group beside Ticket board. It is a canvas
for sketching how a feature moves through the stack before anyone writes it: blocks (web app, API
route, database, queue…) joined by arrows, drawn with React Flow (`@xyflow/react`). Maps are JSON
files in the repo, in the folder a new config key `featureMap.maps` names
(`docs/stack-map/maps` by default). The tool ships built-in blocks and starter maps; a repo's
`featureMap.blocks` file adds its own, and an id matching a built-in replaces it. Board ticket
SM-2.

## Requirements

- **Sidebar and route.** "Stack map" in Product management, after Ticket board, at
  `/#/stack-map?repo=<root>&map=<name>`. A bare `/#/stack-map` shows the first readable repo and a
  new, unsaved map.
- **Draw.** Drag a block from the palette onto the canvas (or click it to add it at the centre),
  connect two blocks by dragging from one's handle to the other's, label blocks and arrows, add a
  note to a block, move and delete them, pan and zoom.
- **Save and reopen.** Save writes `<featureMap.maps>/<name>.json` in the repo's primary checkout
  (`docs/stack-map/maps/<name>.json` by default); the map picker reopens it. Rename and delete
  (after an AlertDialog) from the page.
- **New.** A blank map, or a copy of a starter: the built-in "New endpoint" (page → API route →
  handler → database) and "New DB method" (API route → data-access module → database), plus any
  repo map saved with `starter: true`.
- **Blocks.** The built-in set (web app, API route, background job, database, cache, queue,
  external API, auth, LLM, email, file storage, scheduler, plus Module, see Open questions), with
  the repo's `featureMap.blocks` file merged over it: a block with a built-in's id shows the repo's
  version in the palette, a new id is added after the built-ins.
- **Unreadable files.** A map file or blocks file that doesn't parse is listed with its problem;
  the page still works with the rest.
- **Unsaved changes.** Opening another map, starting a new one or changing repo while the canvas
  has unsaved changes asks first (not in SM-2; flagged under Open questions).
- **Theme.** The canvas follows the page's theme in every variety, light and dark.
- **Decision record** for `@xyflow/react`, the first new page dependency since the board.
- **Implicit.** Every data region has loading, error and empty states; text from the repo (titles,
  labels, notes, block names, paths) renders as text children; every route answers JSON, refusals
  included; `mise run check` passes.
- **Out of scope.** Suggesting blocks from the code (SM-8), the Claude session (SM-13), attaching
  a map to a ticket (SM-9), Mermaid and PNG export, the MCP `draw` tool, auto layout.

## Technical Approach

**Logic in `core/feature-map/`, four thin routes, one page.** The workflows module is the
template (`core/agents/workflows.ts`): files in the repo's primary checkout, read on every
request, written through `writeJsonFile` inside `oneAtATime`, a file that doesn't parse reported
as a problem rather than failing the list. The difference is that the folder comes from the
repo's config, so a small resolver, `featureMapRepo(tracking, root)`, does what `createWorktree`
does first: `trackedRepo`, then `loadRepoConfig`. A config that doesn't load refuses the stack map
with its problem rather than guessing a folder (PLAN.md § Principles, "Refuses what it can't
check").

**Three files in the module.** `schema.ts` holds the map and blocks file formats and the rules a
form shares (title, file name), and imports nothing from Node, so the page imports it as it does
`core/board/schema.ts`. `built-ins.ts` is data: the blocks and the two starters. `maps.ts` reads
and writes a repo's maps and blocks file, and holds the route schemas, which need `PathText` from
`core/repos.ts` (Node).

**The file format is ours; React Flow's shapes stay in the page.** A map file holds nodes as
`{ id, block, label, note?, x, y }` and arrows as `{ id, from, to, label? }`. `web/lib/stack-map-canvas.ts`
converts a map to React Flow nodes and edges and back, so a React Flow upgrade changes the page,
never a file in someone's repo. A node carries its block's name and kind in its data, taken from
the blocks when the map opens, so the node component needs no context; a node whose block the repo
has since removed keeps its id and shows as an unknown block.

**A map is capped by size, under the existing body cap.** A map is at most 200 nodes and 400
arrows (the ticket's limits), and at most 60 KB as compact JSON, so the largest save body stays
under `MAX_BODY_BYTES` (64 KB, `server/routes.ts:180`) with room for `root` and `name`. The page
checks the same rule before sending, so an over-size map gets the schema's sentence rather than
the server's "Request body is too large".

**The page's document is keyed.** `MapEditor` is mounted with `key` set to the map's name, or to a
draft number for an unsaved map, so opening another map or starting a new one starts its state
afresh, as `ProjectForm` is keyed in `web/components/board/project-dialog.tsx`. The editor keeps
the map as last saved and derives "unsaved changes" by comparing it with what the canvas holds
(react-hooks.md § Derive, Don't Store). A save under the same name updates that baseline; a save
under a new name (a new map, a rename) navigates to it.

**The URL names the repo and the map** (`?repo=&map=`), as the GitHub page and the board do, so a
link opens the same map; SM-9 will link a ticket to one. The unsaved draft lives in the page's
route hook, which only the page calls. The repos come from `useRepos()` (`GET /api/repos`, read on
mount and focus), not `useCheckouts()`, which reads every checkout's git state every 15 seconds
(`web/hooks/use-checkouts.ts:11`) and would do so the whole time a map is open, for two fields.

**Two query keys that don't nest.** The overview is `['feature-map', root]` and a map
`['stack-map', root, name]`. Were the map's key under the overview's, invalidating the overview
after a delete or a rename would refetch the map still on screen, and the page would flash "There's
no map" before it navigated away.

**React Flow 13, loaded with its page.** `@xyflow/react@13.0.3` (published 2026-11-23; its peer
range is React `>=18`, and the repo has React 19.3.1). v13 is the current major: its styles sit in
`@layer xyflow`, colours come from `--xy-*` variables, and `forceColorMode` sets the canvas's
mode. The canvas maps those variables to the theme's tokens in `web/index.css` and takes its mode
from `themeMode(theme)` (`web/lib/theme.ts`). Its selectors for `[data-theme='dark']` never match
here: `data-theme` holds a variety's id. Imported after Tailwind in `web/index.css`, `@layer xyflow`
ranks above `utilities`, so Tailwind classes go on our own elements inside a node, never on React
Flow's wrappers or controls; and its `.react-flow__node.selectable:focus-visible { outline: none }`
means the block node draws its own focus ring. The route loads lazily, as `TerminalView` does in
`web/components/layouts/workspace.tsx`, so React Flow, zustand and the d3 modules under it (the two
xyflow bundles alone are about 85 KB gzipped, unminified) load the first time the page opens.

**CSP unchanged** (`server/static.ts:25`). Checked against the 13.0.3 tarball: no `eval` or
`new Function`, no injected `<style>`, no `blob:`; it writes `style` attributes for positions and
transforms, which `style-src 'self' 'unsafe-inline'` allows, and its stylesheet is bundled by
Vite. The attribution is a link to `https://reactflow.dev` with `target="_blank"` and
`rel="noopener noreferrer"`; the app window sends it to the browser (`app/main.ts:52`).

## Implementation Sections

### Section 1: Decision record, PLAN.md, README

**Files to modify/create:**

- `docs/decisions/canvas-react-flow.md` (new) - in `.agents/skills/domain-modeling/ADR-FORMAT.md`
  format, 40–80 lines, `Accepted — 2026-11`:
  - _Context_: the Stack map needs a canvas: drag blocks in, connect them, label, select, delete,
    pan and zoom, by mouse and keyboard, in every theme. The page had no canvas.
  - _Decision_: `@xyflow/react` 13.0.3, pinned exact while the major is weeks old; nodes are our
    own components styled with Tailwind; the file format is ours, converted in
    `web/lib/stack-map-canvas.ts`; themed through its `--xy-*` variables in `web/index.css` and
    `forceColorMode`; the page loads lazily.
  - _Alternatives rejected_: hand-written SVG with d3-zoom (pan, zoom, edge paths, selection,
    keyboard moves and handles are all ours to keep: React Flow is that, on the same d3 modules);
    tldraw (a whiteboard, and its licence wants a key or a watermark in production); Excalidraw
    (freehand drawing, not blocks and arrows, about a megabyte); Mermaid as the editor (text-first,
    no dragging: it stays an export format); React Flow 12.12.1 (the previous major, a migration
    soon after: `useStore` split, change sets, unlayered styles); JointJS, GoJS (commercial or
    not React).
  - _Consequences_: a page dependency with zustand, classcat and four d3 modules under it, in a
    lazy chunk; a major upgrade touches `web/components/feature-map/` and the converter, never a
    saved map; the attribution link shows (the MIT licence allows hiding it; the project asks
    non-subscribers to keep it); the CSP is unchanged.
- `docs/decisions/README.md` - its row in the index.
- `PLAN.md`:
  - § Modules table: Feature map's row reads "a canvas for sketching a feature across the stack
    (the Stack map page)".
  - § Feature map: rewritten. The page reads "Stack map"; the config key stays `featureMap` and
    the scope `feature-map`, since both have shipped. Maps are JSON files in the repo, in
    `featureMap.maps` (default `docs/stack-map/maps`), so they are the repo's to commit, and the
    monitor keeps nothing. Blocks, the repo's blocks file and starters as built. Still to come:
    export as markdown with a Mermaid diagram, as a PNG or as a link, and `draw`.
  - § Config example: `"featureMap": { "blocks": "docs/stack-map/blocks.json", "maps": "docs/stack-map/maps" }`.
  - § Layout: `feature-map/  the map and blocks file formats, built-in blocks and starters, a repo's maps`.
  - § Steps, step 5: what's in (the page, blocks, starters, the file format) and what's left
    (export, `draw`).
- `README.md:8-10` - the status line names the Stack map instead of "the feature map comes next".

**Tests:** None: no new rule.

### Section 2: The config key

**Files to modify/create:**

- `core/config/schema.ts:20` - export `RepoPath` (block paths and docs reuse it).
- `core/config/schema.ts:217` - `FeatureMap` gains `maps`.
- `schema/stack-monitor.schema.json` - rewritten by `mise run schema`.
- `examples/node-postgres.json:53` - adds `"maps": "docs/stack-map/maps"`.

**Config changes:**

```typescript
const FeatureMap = z.strictObject({
  blocks: RepoPath.optional().describe(
    "The repo's own blocks, added to the built-in ones",
  ),
  maps: RepoPath.default('docs/stack-map/maps').describe(
    'The folder saved maps are written to',
  ),
})
```

**Tests:**

- `tests/config-schema.test.ts` › 'keeps paths inside the checkout': add
  `featureMap: { maps: '../maps' }` → `featureMap.maps: must be a path inside the checkout, without ..`.

### Section 3: Types and the file formats

**Files to modify/create:**

- `core/types.ts` - the shapes below.
- `core/feature-map/schema.ts` (new) - the zod schemas, limits, `mapName`, `mapProblem`.
- `tsconfig.web.json` `include` and `mise.toml` `[tasks.build].sources` - add
  `core/feature-map/schema.ts` (the two lists name the core files the page imports).

**Type definitions** (`core/types.ts`):

```typescript
export const BLOCK_KINDS = ['client', 'server', 'data', 'external'] as const
export type BlockKind = (typeof BLOCK_KINDS)[number]

// A piece a stack map is drawn with: one of the tool's own, or one from the repo's
// featureMap.blocks file.
export interface Block {
  id: string
  name: string
  kind: BlockKind
  paths: string[] // where its code lives, relative to the repo root
  docs: string[] // what to read before changing it
}

export interface BlockInfo extends Block {
  source: 'built-in' | 'repo' // repo: the repo's file added it, or replaced the built-in
}

export interface StackMapNode {
  id: string
  block: string // a block's id
  label: string // '' shows the block's name
  note?: string
  x: number
  y: number
}

export interface StackMapEdge {
  id: string
  from: string // a node's id
  to: string
  label?: string
}

// <featureMap.maps>/<name>.json in a repo. GET /api/feature-map/map?root=&name=
export interface StackMap {
  version: 1
  title: string
  starter: boolean // offered under New from starter
  nodes: StackMapNode[]
  edges: StackMapEdge[]
}

export interface StackMapSummary {
  name: string // the file's name without .json
  title: string
  starter: boolean
}

export interface StackMapStarter {
  name: string
  source: 'built-in' | 'repo'
  map: StackMap
}

// GET /api/feature-map?root=
export interface FeatureMapOverview {
  folder: string // featureMap.maps, relative to the repo root
  blocks: BlockInfo[] // the built-ins in their order, the repo's replacing any it names, then its own
  maps: StackMapSummary[] // by name
  starters: StackMapStarter[] // the built-in ones, then the repo's maps saved as starters
  problems: { file: string; problem: string }[] // a blocks or map file that didn't parse
}
```

**Code changes** (`core/feature-map/schema.ts`):

```typescript
// What a stack map file and a repo's blocks file hold, and the rules the save form shares. Imports
// nothing from Node, so the page imports it too.
export const MAX_NODES = 200
export const MAX_EDGES = 400
// Compact JSON, as the page sends it: under the server's 64 KB body cap with room for root and name.
export const MAX_MAP_BYTES = 60 * 1024
export const MAX_MAP_NAME = 60

export const MapTitle = z
  .string()
  .trim()
  .min(1, 'Give it a title')
  .max(120)
  .regex(/^[^\r\n]*$/, 'Keep the title to one line')
export const MapName = z
  .string()
  .regex(
    /^[a-z0-9][a-z0-9-]{0,59}$/,
    'Use up to 60 lowercase letters, digits and -, starting with a letter or digit',
  )

// The file a title saves to unless another name is typed: "Guest checkout" → guest-checkout.
export function mapName(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, MAX_MAP_NAME)
    .replace(/-+$/, '')
}

const ElementId = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/)
const Text = z.string().max(80)
const Coordinate = z.number().min(-1e6).max(1e6)

export const StackMapSchema = z
  .strictObject({
    version: z.literal(1),
    title: MapTitle,
    starter: z.boolean().default(false),
    nodes: z
      .array(
        z.strictObject({
          id: ElementId,
          block: Name,
          label: Text,
          note: z.string().max(1000).optional(),
          x: Coordinate,
          y: Coordinate,
        }),
      )
      .max(MAX_NODES),
    edges: z
      .array(
        z.strictObject({
          id: ElementId,
          from: ElementId,
          to: ElementId,
          label: Text.optional(),
        }),
      )
      .max(MAX_EDGES),
  })
  .superRefine((map, ctx) => {
    // a node id used twice, an edge id used twice, an edge whose from or to isn't a node here, and
    // the size: each an issue at its path, the size at the root with the sentence below
  }) satisfies z.ZodType<StackMap>

// size issue: `This map is ${kb} KB; a map holds up to 60 KB. Shorten its notes, or split it in two.`

// The first thing wrong with a map, as the save form shows it; null when it would save.
export function mapProblem(map: StackMap): string | null

export const BlockSchema = z.strictObject({
  id: Name,
  name: z.string().trim().min(1).max(40),
  kind: z.enum(BLOCK_KINDS),
  paths: z.array(RepoPath).max(20).default([]),
  docs: z.array(RepoPath).max(20).default([]),
}) satisfies z.ZodType<Block>

// featureMap.blocks: { "version": 1, "blocks": [...] }, no two with one id.
export const BlocksFileSchema = z
  .strictObject({
    version: z.literal(1),
    blocks: z.array(BlockSchema).max(100),
  })
  .superRefine(/* an id used twice */)
```

`Name` and `RepoPath` come from `core/config/schema.ts`, which the page already imports.

**Tests** (`tests/feature-map.test.ts`, new):

- 'a map is refused for a node id used twice, an arrow to a node it has not, and a size over 60
  KB': one test looping over the three, asserting each issue's path and that `mapProblem` returns
  the size sentence for the last.
- 'a title becomes a file name': loops over `Guest checkout` → `guest-checkout`, `Café: v2!` →
  `cafe-v2`, a 90-character title cut to 60 with no trailing `-`, and `お知らせ` → `''`.

### Section 4: Built-in blocks and starters, a repo's maps

**Files to modify/create:**

- `core/feature-map/built-ins.ts` (new) - `BUILT_IN_BLOCKS: Block[]` and
  `BUILT_IN_STARTERS: { name: string; map: StackMap }[]`.
- `core/feature-map/maps.ts` (new) - the resolver, the reads and writes, and the route schemas.

**Built-ins.** Blocks, in this order, `paths` and `docs` empty:

| id               | name           | kind     |
| ---------------- | -------------- | -------- |
| `web-app`        | Web app        | client   |
| `api-route`      | API route      | server   |
| `module`         | Module         | server   |
| `background-job` | Background job | server   |
| `scheduler`      | Scheduler      | server   |
| `auth`           | Auth           | server   |
| `database`       | Database       | data     |
| `cache`          | Cache          | data     |
| `queue`          | Queue          | data     |
| `file-storage`   | File storage   | data     |
| `external-api`   | External API   | external |
| `llm`            | LLM            | external |
| `email`          | Email          | external |

Starters, left to right 240 apart: `new-endpoint`, "New endpoint": Page (`web-app`) → API route
(`api-route`) → Handler (`module`) → Database (`database`), arrows labelled "calls", "",
"reads and writes". `new-db-method`, "New DB method": API route (`api-route`) → Data-access module
(`module`) → Database (`database`).

**Code changes** (`core/feature-map/maps.ts`):

```typescript
export interface FeatureMapRepo {
  root: string // the primary checkout
  maps: string // featureMap.maps
  blocks: string | undefined // featureMap.blocks
}

// The tracked repo and where its maps and blocks are, from its config as read now.
export function featureMapRepo(
  tracking: Tracking,
  given: string,
): FeatureMapRepo | Unlisted {
  const repo = trackedRepo(tracking, given)
  if (!('root' in repo)) return repo
  const loaded = loadRepoConfig(tracking, repo.root)
  if (!loaded.ok) {
    return { refused: `${loaded.problem}. Fix it to use the stack map.` }
  }
  return { root: repo.root, ...loaded.config.featureMap }
}

export const StackMapQuery = z.object({ root: PathText, name: MapName })
export const SaveStackMapRequest = z.strictObject({
  root: PathText,
  name: MapName,
  map: StackMapSchema,
  replacing: MapName.optional(), // the name it's saved under now, when it was opened from a file
})
export const DeleteStackMapRequest = z.strictObject({
  root: PathText,
  name: MapName,
})

export function readFeatureMap(repo: FeatureMapRepo): FeatureMapOverview
export function readStackMap(
  repo: FeatureMapRepo,
  name: string,
): StackMap | Unlisted | null
export function saveStackMap(
  repo: FeatureMapRepo,
  name: string,
  map: StackMap,
  replacing?: string,
): Promise<ActionResult>
export function deleteStackMap(
  repo: FeatureMapRepo,
  name: string,
): Promise<ActionResult>
```

- **`readFeatureMap`**: the blocks file (when `blocks` is set) through `BlocksFileSchema`; a file
  that's missing, isn't JSON or fails the schema is one entry in `problems`, its `file` the blocks
  path, and the built-ins are offered alone. Blocks merge: each built-in in order, replaced
  by the repo's block with its id (`source: 'repo'`), then the repo's other blocks in their file's
  order. Maps: `readdirSync(join(root, maps))`, `.json` files only, sorted; each through
  `StackMapSchema` (the same `readWorkflowFile` shape: `isn't readable JSON: …`, or
  `describeIssues`), a failure going to `problems` as `<maps>/<file>`. A missing folder is no
  maps; any other error reading it is a problem naming the folder. A file whose name isn't a
  `MapName` (`Notes.json`) is a problem too, since it couldn't be opened by name. Starters: the
  built-ins, then each readable map with `starter: true`.
- **`readStackMap`**: `null` when there's no `<name>.json`; `{ refused: '<maps>/<name>.json <problem>' }`
  when it doesn't parse.
- **`saveStackMap`**: inside `oneAtATime`, the refusals `saveWorkflow` has
  (`core/agents/workflows.ts:123`), worded for maps: the map, name or `replacing` failing their
  schemas, "There's no map `<replacing>` to replace", "A map named `<name>` already exists" when
  the name is taken by another file. Writes with `writeJsonFile` (which makes the folder), removes
  `replacing` after a rename. Answers `Saved <maps>/<name>.json` (`docs/stack-map/maps/…` by
  default), with ` (renamed from <replacing>)`.
- **`deleteStackMap`**: refuses a name that isn't a `MapName` and a map that isn't there; removes
  only `<maps>/<name>.json`. Answers `Deleted <maps>/<name>.json`.

**Tests** (`tests/feature-map.test.ts`), each against a temp directory as the repo root, as the
workflows tests do (`tests/skills-workflows.test.ts:145`):

- 'a repo block replaces the built-in with its id and its new ones follow; a blocks file that does
  not parse is a problem and the built-ins stay': also asserts every built-in starter passes
  `StackMapSchema` and names only blocks the overview offers.
- 'saves, reads, lists, renames and deletes a map, listing a file that does not parse as a
  problem': save into a folder that doesn't exist yet, read it back, list it, add `broken.json`
  and `Notes.json` and see both under `problems`, rename, delete; a map saved with `starter: true`
  shows under `starters` after the built-ins.
- 'refuses a name taken, replacing one that is not there, a bad name, and deleting one that is
  not there'.

### Section 5: Routes

**Files to modify/create:**

- `server/routes.ts` - four entries after the workflow routes (the last is
  `'POST /api/workflows/run-claude'`, `server/routes.ts:416`), each
  resolving the repo with `featureMapRepo` and answering `notRead` (409, or 500 when the list
  can't be read) when it can't.

| Route                                                        | Answers                                                                        |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `GET /api/feature-map?root=`                                 | 200 `FeatureMapOverview`                                                       |
| `GET /api/feature-map/map?root=&name=`                       | 200 `StackMap`; 404 "There's no map `<name>`"; 409 when the file doesn't parse |
| `POST /api/feature-map/save { root, name, map, replacing? }` | `settled`: 200, or 409 for a refusal; 400 for a body of the wrong shape        |
| `POST /api/feature-map/delete { root, name }`                | `settled`                                                                      |

```typescript
'GET /api/feature-map/map': route(
  StackMapQuery,
  '?root=&name=',
  async ({ root, name }) => {
    const repo = featureMapRepo(tracking, root)
    if (!('maps' in repo)) return notRead(repo)
    const map = readStackMap(repo, name)
    if (map === null) return [404, failure(`There's no map ${name}`)]
    return 'version' in map ? [200, map] : notRead(map)
  },
),
```

**Tests:**

- `tests/routes.test.ts`, new test 'the stack map: maps go to the folder the config names, a map
  not there is a 404, a root not tracked is a 409': writes `featureMap: { maps: 'sketches' }` to
  `<primary>/stack-monitor.json`, saves through the route and finds `<primary>/sketches/<name>.json`,
  reads the overview and the map back, gets 404 for another name and 409 for an untracked root,
  then a broken `stack-monitor.json` makes the overview a 409 with the config's problem. Resets the
  file to `{}` at the end, as 'repos lists the seed with its config' does (`tests/routes.test.ts:92`).

### Section 6: The page's plumbing

**Files to modify/create:**

- `package.json`, `package-lock.json` - `npm install --save-exact @xyflow/react@13.0.3`.
- `web/index.css` - `@import '@xyflow/react/style.css';` after the shadcn import, and the
  variables mapped to tokens:

  ```css
  .react-flow {
    --xy-background-color: var(--background);
    --xy-background-pattern-color: var(--border);
    --xy-edge-stroke: var(--muted-foreground);
    --xy-edge-stroke-selected: var(--primary);
    --xy-connectionline-stroke: var(--primary);
    --xy-handle-background-color: var(--primary);
    --xy-handle-border-color: var(--background);
    --xy-edge-label-background-color: var(--card);
    --xy-edge-label-color: var(--foreground);
    --xy-controls-button-background-color: var(--card);
    --xy-controls-button-background-color-hover: var(--muted);
    --xy-controls-button-color: var(--foreground);
    --xy-controls-button-color-hover: var(--strong);
    --xy-controls-button-border-color: var(--border);
    --xy-selection-background-color: color-mix(
      in oklab,
      var(--primary) 10%,
      transparent
    );
    --xy-selection-border: 1px dotted var(--primary);
    --xy-attribution-background-color: transparent;
  }
  ```

- `web/router.tsx` - the route, loaded with its page:

  ```tsx
  {
    path: 'stack-map',
    lazy: async () => ({
      Component: (await import('@/components/pages/stack-map.tsx')).StackMap,
    }),
  },
  ```

- `web/components/layouts/sidebar.tsx:47` - `{ to: '/stack-map', label: 'Stack map', icon: Workflow, end: false }`
  after Ticket board (`Workflow` from lucide).
- `web/components/repos/repo-list.tsx:15` - the module's label reads "Stack map", so Settings and
  the sidebar call it the same (flagged under Open questions).
- `web/lib/stack-map-links.ts` (new) - `stackMapPath(root, name?)` and `readMapName(value)` (the
  `map` query value when it's a `MapName`), as `web/lib/github-links.ts` does.
- `web/lib/stack-map-canvas.ts` (new): relative imports only, and only `import type` from
  `@xyflow/react`, so node can test it without loading the library (the arrow is
  `markerEnd: { type: 'arrowclosed' }`, which `EdgeMarker.type` takes as `` `${MarkerType}` ``):

  ```typescript
  export interface MapNodeData extends Record<string, unknown> {
    block: string
    label: string
    note: string
    blockName: string // the block's name when the map opened
    kind: BlockKind | null // null: the repo no longer has this block
  }
  export type MapNode = Node<MapNodeData, 'block'>

  export function blankMap(): StackMap // version 1, "Untitled map", no nodes
  export function starterCopy(starter: StackMapStarter): StackMap // starter: false
  export function toCanvas(
    map: StackMap,
    blocks: BlockInfo[],
  ): { nodes: MapNode[]; edges: Edge[] }
  export function fromCanvas(
    meta: { title: string; starter: boolean },
    nodes: MapNode[],
    edges: Edge[],
  ): StackMap // positions rounded; note '' dropped; edge label read back only when a string
  export function sameMap(a: StackMap, b: StackMap): boolean
  export function freshId(prefix: 'n' | 'e', taken: ReadonlySet<string>): string
  ```

  Edges are built with that arrow and their label as `label`.

- Hooks, each in `web/hooks/`:

  | Hook                              | Holds                                                                                                                                                                                                                                                                                                                                                                                   |
  | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `useFeatureMap(root)`             | `GET /api/feature-map`; exports `featureMapKey(root) = ['feature-map', root]`; no interval (a file changes when someone edits it: refetch on focus shows it); derives `palette`, the blocks grouped by kind in `BLOCK_KINDS` order (react-data-fetching.md § The Fetch Layer: grouping for a page is the hook's)                                                                        |
  | `useStackMap(root, name)`         | `GET /api/feature-map/map`; exports `stackMapKey(root, name) = ['stack-map', root, name]`; enabled when both are set                                                                                                                                                                                                                                                                    |
  | `useStackMapMutations(root)`      | `saveMap({ name, map, replacing })`, `deleteMap(name)`, `isSaving`, `isDeleting`; the server's message as the success toast, `toastFailure("Couldn't save the map" / "Couldn't delete the map", error)`; in `onSettled`, a save invalidates `featureMapKey(root)` and `stackMapKey(root, name)`, a delete only `featureMapKey(root)`                                                    |
  | `useStackMapRoute()`              | the `repo` and `map` query values, the unsaved draft `{ key, map }`, `openRepo(root)` (which starts a blank draft too, so one repo's draft never shows under another), `openMap(root, name)`, `startDraft(root, map)`; called only by the page, since it holds the draft                                                                                                                |
  | `useStackMapFlow(root, route)`    | `save(from, name, map)`: checks `mapProblem` first, saves with `replacing: from ?? undefined`, then `openMap` when the name changed; `remove(name)`: deletes, then `startDraft(root, blankMap())`. Each rejects after the toast                                                                                                                                                         |
  | `useStackMapState(draft, blocks)` | the canvas: `useNodesState` / `useEdgesState` from `toCanvas` once; `meta`; `onConnect` (with `freshId`); `addBlock(block, position)`; `updateNode(id, { label, note })`; `updateEdge(id, label)`; `connect(from, to)`; `remove(id)`; `selected` (the one selected node or edge, derived); `current` (`fromCanvas`, memoised); `isDirty` (`!sameMap(current, saved)`); `markSaved(map)` |

  Every returned object is memoised and every returned function stable
  (react-data-fetching.md § Queries and Mutations Live in a Hook). `useStackMapState` takes a
  `MapDraft = { name: string | null; map: StackMap }`.

**Tests:**

- `tests/stack-map-canvas.test.ts` (new) 'a map goes to the canvas and back unchanged': a starter
  with a note and an edge label round-trips through `toCanvas` and `fromCanvas`; a dragged
  position comes back rounded; a node whose block isn't offered keeps its block id with
  `kind: null`; `sameMap` is false once a label changes.

### Section 7: The page and its components

**Files to modify/create** (`web/components/feature-map/` new, beside `pages/stack-map.tsx`):

- `pages/stack-map.tsx` - `StackMap`: the heading and one line on what a map is; the repos from
  `useRepos()` (those with `problem === null`), the repo the URL names or the first; `useFeatureMap`,
  and `useStackMap` when the URL names a map. States: repos loading (a `Skeleton` the editor's
  shape), no repo ("Add one in Settings", as `github.tsx:62`), the asked repo not in the list, the
  overview's error (`role="alert"`, the server's message: an untracked repo or a config that
  doesn't load), the named map's 404 ("There's no map `<name>`" and "Start a new map") or 409 (its
  problem). Otherwise `<ReactFlowProvider key={…}><MapEditor …/></ReactFlowProvider>`: the
  provider sits here, keyed with the document, so `MapEditor`'s own handlers can call
  `useReactFlow()` (a component can't read a provider it renders). The page doesn't name the
  `StackMap` type; where a file needs both, `import type { StackMap as StackMapFile }`.
- `feature-map/map-editor.tsx` - `MapEditor({ root, repos, overview, palette, draft, route })`:
  holds `useStackMapState` and `useStackMapFlow`; lays out the toolbar, `MapProblems`, then
  palette | canvas | inspector (stacked on a narrow screen). The canvas area has a height of its
  own (`h-[70dvh] min-h-96`), since the page pane scrolls and gives none. Owns which dialog is
  open, and `leave(then)`: runs `then` at once, or after `DiscardChangesDialog` when `isDirty`.
- `web/components/board/repo-select.tsx:13` - `repos` widens from `RepoCheckouts[]` to
  `Pick<RepoCheckouts, 'root' | 'name'>[]`, the two fields it reads, so a `RepoStatus[]` fits; the
  board's `session-repo.tsx` passes `RepoCheckouts[]` as before. A `change`, type-only.
- `feature-map/map-toolbar.tsx` - `RepoSelect` when more than one repo; `MapPicker`; a New
  `DropdownMenu` (Blank map, then a group per starter, a repo's marked "from this repo", keyed by
  `<source>:<name>` since a repo map may share a built-in starter's name); Save (`disabled` while
  saving or when an opened map has no changes: a saved map saves at once, an unsaved one opens
  `SaveMapDialog`); a `…` menu with Details… and Delete… for a saved map.
- `feature-map/map-picker.tsx` - a `Select` of the repo's maps by title; an unsaved map reads
  "Unsaved map".
- `feature-map/map-problems.tsx` - each of `overview.problems` as `<file>: <problem>` under
  "Couldn't read", `text-warning`, `role="status"`, nothing when there are none.
- `feature-map/block-palette.tsx` - `palette` from `useFeatureMap`, a heading per kind; each block
  a `Button` with its kind's icon that adds it at the canvas's centre on click and drags onto the
  canvas (`draggable`, `dataTransfer` type `application/x-stack-map-block` holding its id); a
  repo's block says so (a `Pill` reading "repo").
- `feature-map/block-kinds.ts` - `KIND_LABELS` and `KIND_ICONS` as `Record<BlockKind, …>`
  (react-components.md § Map domain values to variants in the feature component).
- `feature-map/map-canvas.tsx` - `<ReactFlow>` with `nodeTypes={{ block: BlockNode }}` (a
  module-level constant), `fitView`, `deleteKeyCode={['Backspace', 'Delete']}`,
  `forceColorMode={themeMode(theme)}`, `onDragOver` / `onDrop` (`screenToFlowPosition`), `<Background />`
  and `<Controls />`. An empty map shows a hint over the canvas: drag a block in, or click one.
- `feature-map/block-node.tsx` - `BlockNode`: the kind's icon, the label (or the block's name when
  the label is empty), the block's name beneath when it differs; "Unknown block `<id>`" when
  `kind` is null; a target `Handle` on the left, a source one on the right. Text as text children.
  A ring when `selected`, and another when its wrapper has keyboard focus
  (`in-focus-visible:ring-2`), since React Flow's stylesheet takes the wrapper's outline away.
- `feature-map/map-inspector.tsx` - for the selected block: Label (`Input`), Note (`Textarea`),
  the block's `paths` and `docs` as text, "Add an arrow to…" (a `Select` of the other blocks, for
  the keyboard), Remove. For the selected arrow: Label and Remove. With nothing selected, a line
  saying to select a block or an arrow. These inputs write to the canvas state as typed; they are
  not a submitted form (Style Guide Suggestions).
- `feature-map/save-map-dialog.tsx` - `SaveMapDialog({ open, draftName, map, onClose })`: a
  react-hook-form form (react-forms.md) with Title (`MapTitle`), File name (`MapName`, following
  `mapName(title)` until it's typed in, as the prefix follows the name in
  `web/components/board/project-dialog.tsx:82`), and "Offer it under New from starter" (`Checkbox`).
  A title with nothing `mapName` can use leaves File name empty, and `MapName`'s own message asks
  for one on submit. The description under File name shows `<folder>/<name>.json`. Submits
  through `flow.save`; closes on success, stays open on failure.
- `feature-map/discard-changes-dialog.tsx` - an `AlertDialog`: "Discard the changes to
  `<title>`?", Keep editing / Discard.
- Delete reuses `ConfirmDeleteDialog` (`web/components/board/confirm-delete-dialog.tsx`): "Delete
  `<title>`?", "Removes `<folder>/<name>.json` from the repo's primary checkout."

**Tests:** None: the page has no automated suite; the drive below covers it, and the routes it
calls are covered in Section 5.

## Config & Contract

- **Config.** `featureMap.maps` is optional with a default, so every existing `stack-monitor.json`
  still loads. `mise run schema` rewrites `schema/stack-monitor.schema.json`;
  `examples/node-postgres.json` shows the key.
- **Routes and types.** Four new routes; the new `core/types.ts` shapes are read only by the page.
  No MCP tool changes.
- **Writes and deletes in the repo.** Save writes, and delete removes, one file:
  `<featureMap.maps>/<name>.json` in the primary checkout, the name held to `MapName`, so it can't
  leave the folder. The maps are the person's files, kept in their repo for them to commit; the
  monitor keeps nothing and reads the folder again on every request (PLAN.md § Principles, "Reads,
  doesn't remember"). A save never lands on another map, a delete or rename refuses a map that
  isn't there, and a config that doesn't load refuses rather than guessing the folder ("Refuses
  what it can't check"). Every route keeps the Host, Origin and body checks, and a map's 60 KB cap
  keeps the largest save under the 64 KB body cap ("Local only"). It runs no command and signals
  nothing.

## Verification Checklist

- [ ] Stack map shows in Product management, after Ticket board, and opens at `/#/stack-map`
- [ ] Blocks drag out of the palette and click in; two connect by dragging handle to handle
- [ ] A block's label and note, and an arrow's label, change from the inspector and show on the
      canvas
- [ ] Save writes `docs/stack-map/maps/<name>.json` in the primary checkout; the picker reopens it
      unchanged, and a reload of its URL opens it
- [ ] Details… renames the file; Delete… removes it after the AlertDialog
- [ ] New from starter copies "New endpoint" and "New DB method"; a map saved as a starter is
      offered too
- [ ] A repo block with a built-in's id shows the repo's version in the palette, marked "repo"
- [ ] A malformed map file or blocks file is listed under "Couldn't read" and the page works
- [ ] Switching map, repo or starting a new one with unsaved changes asks first
- [ ] The canvas follows a light and a dark variety
- [ ] `mise run schema` leaves no diff; `mise run check` passes
- [ ] No regressions: the board, Settings' module list and the other routes behave as before

**The drive** (port 7430, from the worktree, against a scratch repo so no real repo gets maps):

1. Make `<scratch>/demo` with `git init` and one commit, its `stack-monitor.json` naming
   `featureMap.blocks: "docs/stack-map/blocks.json"`, and that file holding
   `{ "version": 1, "blocks": [{ "id": "database", "name": "Postgres", "kind": "data", "paths": ["db/"] }, { "id": "billing", "name": "Billing service", "kind": "external" }] }`.
2. `STACK_MONITOR_SETTINGS=<scratch>/monitor.json STACK_MONITOR_REPO=<scratch>/demo STACK_MONITOR_PORT=7430 mise run dev`
   in the background; open `http://127.0.0.1:7430/#/stack-map`.
3. The palette shows "Postgres" where Database was, marked repo, and "Billing service" at the end
   of External.
4. Drag a Web app and an API route in, click Postgres in, connect them, label one arrow "calls",
   give the API route a note. Save as "Guest checkout": `docs/stack-map/maps/guest-checkout.json`
   exists in `<scratch>/demo`, and the toast names it.
5. New → Blank map: no question (nothing unsaved). Move a block of the blank map, then pick Guest
   checkout in the picker: the discard question shows; Discard opens it as saved.
6. Reload: the same map opens from the URL. Details…: retitle "Guest checkout v2": the file name
   stays (a saved map's file doesn't follow its title). Then type a new file name: the old file is
   gone, the new one there.
7. New from starter → New endpoint: four blocks, three arrows. Save it with "Offer it under New
   from starter": it shows in the New menu marked from this repo.
8. Write `{ nope` to `docs/stack-map/maps/broken.json`, refocus: "Couldn't read" lists it; the
   picker and canvas still work. Do the same to the blocks file: built-ins return, a problem shows.
9. Delete… the map: the AlertDialog, then the file is gone and a blank map shows, with no "There's
   no map" between (the same after the rename in step 6).
10. Switch the theme to a dark variety and back: canvas, handles, arrows and controls follow.
11. Keyboard: Tab to a block on the canvas (a focus ring shows), move it with the arrow keys,
    Delete removes it; "Add an arrow to…" connects two blocks without the mouse.
12. The console shows no CSP violation and no React Flow warning.

## Open questions

- **Which React Flow?** 13.0.3 (the current major, five days old, its first major in two years)
  or 12.12.1 (the last 12.x, a month old). — 13.0.3, pinned exact (`--save-exact`) while the
  major is new: starting on 12 means migrating soon after (`useStore` split into stores,
  `NodeChangeset` in place of change arrays, `fitView` padding), and 13's layered CSS and
  `forceColorMode` fit the page's Tailwind layers and theme varieties. The other page
  dependencies use `^`; this one moves to `^13` once the major has settled.
- **A Module block.** The starters name a handler and a data-access module, and none of the
  twelve listed blocks is either. — Add a thirteenth built-in, `module` ("Module", server): a
  piece of server code. The alternative, labelling an API route block "Handler", draws the wrong
  kind of thing.
- **The overview's shape.** The ticket gives `{ blocks, maps: [{ name, title, starter }] }`. —
  Add `starters` (each with its map, so New from starter needs no second read), `problems` (for
  the unreadable-file requirement, as `WorkflowList` does) and `folder` (for the save dialog's
  path line).
- **The blocks file.** — `{ "version": 1, "blocks": [...] }` rather than a bare array, so it can
  change shape the way a map file can.
- **Size.** — Cap a map at 60 KB of compact JSON, under the existing body cap, rather than raising
  `MAX_BODY_BYTES` for every route; at about 150 bytes a block, 200 blocks with short labels fit.
- **The file name.** — A field of its own in the save dialog, following the title until typed
  in, rather than always derived: a title with no Latin letters or digits makes no name, and the
  file is committed in someone's repo.
- **A broken config.** — The stack map refuses with the config's problem, as a worktree create
  does, rather than falling back to `docs/stack-map/maps`.
- **Where maps live.** — The primary checkout only, as workflows do; a map in a linked worktree's
  copy of the folder isn't listed.
- **Unsaved changes.** — Asked about only within the page (map, repo, new); leaving for another
  page or reloading isn't stopped, since `beforeunload` in the app window would block closing it.
- **Lazy route.** — Load the page lazily, as the terminal view is; it is the router's first lazy
  route.
- **The repo picker.** — Reuse `RepoSelect` from `web/components/board/`, as the ticket says,
  importing across feature folders as the GitHub page does with `stack/segmented.tsx` (Style Guide
  Suggestions), over `useRepos()` rather than the board's `useCheckouts()`, with its prop widened
  to the two fields it reads. `useCheckouts()` would read every checkout's git state every 15
  seconds for as long as a map is open.
- **Query keys.** — The overview's and a map's keys don't nest (`['feature-map', root]`,
  `['stack-map', root, name]`), against react-data-fetching.md's "broad part first", so a delete
  or rename doesn't refetch the map on screen into a 404.

**Not asked for by SM-2, kept, flagged for the reviewer** (each small; drop any at review):

- the discard question before leaving unsaved changes (Requirements, Section 7);
- "Add an arrow to…" in the inspector, so two blocks connect without a mouse;
- the page checking `mapProblem` before sending, for the size sentence over "Request body is too
  large";
- the "repo" pill on a palette block the repo's file supplies;
- the lazy route;
- Settings' module chip reading "Stack map" instead of "Feature map"
  (`web/components/repos/repo-list.tsx:15`), so Settings and the sidebar call it the same.

## Style Guide Suggestions

- **Inputs that edit a document in place.** `react-forms.md` says every form is react-hook-form
  with a submit. The inspector's Label and Note write into the canvas as typed, with nothing to
  submit. Suggest a line there: an input bound to an editor's live state uses the `Input` or
  `Textarea` primitive with the editor hook's setter, and a form is for what's submitted.
- **Sharing a domain component between features.** `react-components.md` § Where a Component
  Lives says to move a component to `ui/` once a second feature needs it, with the domain
  stripped. Main imports across feature folders instead (`pages/github.tsx` and
  `stack/segmented.tsx`, `board/` from `agents/` and `stack/`), and this plan imports
  `board/repo-select.tsx` and `board/confirm-delete-dialog.tsx`. Settle whether a component that
  keeps its domain moves to the folder of the domain it's about (`repos/repo-select.tsx`) or is
  imported where it is.
- **`toastFailure`'s arguments.** `react-toasts.md` shows `toastFailure(error, title)`;
  `web/lib/toast-failure.ts:4` takes `(title, failure)`. The guide should match the code.
- **A library themed by CSS variables.** React Flow's `--xy-*` are the first library variables
  mapped to tokens in `web/index.css` (xterm's theme is a JS object, `web/lib/terminal-theme.ts`).
  `react-components.md` § Colour comes from the theme could say that such a mapping lives in
  `web/index.css`, token to variable, never a palette value.
