// How the page and the terminals share the screen: a tree of splits whose leaves are the page (one,
// always) and terminal panes, each an ordered strip of session tabs. Every operation is a pure
// (layout, …) => layout and hands its input back when nothing moves, so React skips the render.
// Relative imports: tests/pane-layout.test.ts runs this file under node, which has no `@/` alias.
import type { Swatch } from './swatches.ts'

export type Edge = 'left' | 'right' | 'top' | 'bottom'
export type DropZone = Edge | 'centre'
export type NewId = () => string

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
  focused: string | null // the terminal pane that shortcuts and new sessions go to
  pageHidden: boolean
  terminalsHidden: boolean
}

export interface TabStyle {
  name?: string
  colour?: Swatch
}

export type TabStyles = Record<string, TabStyle> // by session id

export type TabTarget =
  | { pane: string; index: number } // into a pane's strip, at that place
  | { beside: string; edge: Edge } // into a new pane on that side of a pane or the page

// What a dragged tab carries: its session id, under a type only a pane's drop targets accept.
export const TAB_DRAG_TYPE = 'application/x-stack-monitor-session'

export const PAGE: PageLeaf = { kind: 'page', id: 'page' }

export const DEFAULT_LAYOUT: PaneLayout = {
  root: PAGE,
  focused: null,
  pageHidden: false,
  terminalsHidden: false,
}

const NEW_PANE_SHARE = 40 // a first terminal pane beside the page, as wide as the old panel

// ---- reading the tree ----

export function leaves(node: LayoutNode): (PageLeaf | TerminalLeaf)[] {
  return node.kind === 'split' ? node.children.flatMap(leaves) : [node]
}

export function terminalPanes(node: LayoutNode): TerminalLeaf[] {
  return leaves(node).filter((leaf) => leaf.kind === 'terminals')
}

export function paneOf(
  node: LayoutNode,
  session: string,
): TerminalLeaf | undefined {
  return terminalPanes(node).find((pane) => pane.tabs.includes(session))
}

export function findPane(
  node: LayoutNode,
  id: string | null,
): TerminalLeaf | undefined {
  return terminalPanes(node).find((pane) => pane.id === id)
}

// Every placed session, pane by pane in tree order.
export function placedSessions(node: LayoutNode): string[] {
  return terminalPanes(node).flatMap((pane) => pane.tabs)
}

// ---- changing the tree ----

function replaceNode(
  node: LayoutNode,
  id: string,
  next: LayoutNode,
): LayoutNode {
  if (node.id === id) return next
  if (node.kind !== 'split') return node
  let changed = false
  const children = node.children.map((child) => {
    const replaced = replaceNode(child, id, next)
    if (replaced !== child) changed = true
    return replaced
  })
  return changed ? { ...node, children } : node
}

// The node's share goes to the sibling before it, or after it when it was first; a split left with
// one child becomes that child, in the split's place and share.
function removeNode(node: LayoutNode, id: string): LayoutNode {
  if (node.kind !== 'split') return node
  const index = node.children.findIndex((child) => child.id === id)
  if (index === -1) {
    let changed = false
    const children = node.children.map((child) => {
      const removed = removeNode(child, id)
      if (removed !== child) changed = true
      return removed
    })
    return changed ? { ...node, children } : node
  }
  const children = node.children.filter((_, at) => at !== index)
  if (children.length === 1) return children[0]
  const sizes = node.sizes.filter((_, at) => at !== index)
  const heir = index > 0 ? index - 1 : 0
  sizes[heir] += node.sizes[index]
  return { ...node, children, sizes }
}

const axis = (edge: Edge) =>
  edge === 'left' || edge === 'right' ? 'row' : 'column'
const leads = (edge: Edge) => edge === 'left' || edge === 'top'

// `leaf` on `edge` of the node `beside`, taking `share` percent of its room. Along the parent's
// axis it joins the parent as a sibling; across it, `beside` is wrapped in a new split.
function insertNode(
  node: LayoutNode,
  beside: string,
  edge: Edge,
  leaf: LayoutNode,
  newId: NewId,
  share = 50,
): LayoutNode {
  const direction = axis(edge)
  if (node.id === beside) {
    return {
      kind: 'split',
      id: newId(),
      direction,
      children: leads(edge) ? [leaf, node] : [node, leaf],
      sizes: leads(edge) ? [share, 100 - share] : [100 - share, share],
    }
  }
  if (node.kind !== 'split') return node
  const index = node.children.findIndex((child) => child.id === beside)
  if (index !== -1 && node.direction === direction) {
    const children = [...node.children]
    const sizes = [...node.sizes]
    const taken = (sizes[index] * share) / 100
    sizes[index] -= taken
    const at = leads(edge) ? index : index + 1
    children.splice(at, 0, leaf)
    sizes.splice(at, 0, taken)
    return { ...node, children, sizes }
  }
  let changed = false
  const children = node.children.map((child) => {
    const inserted = insertNode(child, beside, edge, leaf, newId, share)
    if (inserted !== child) changed = true
    return inserted
  })
  return changed ? { ...node, children } : node
}

// Hidden flags only mean something while there's a terminal pane to show instead of the page.
function settle(layout: PaneLayout): PaneLayout {
  const panes = terminalPanes(layout.root)
  const focused =
    panes.find((pane) => pane.id === layout.focused)?.id ?? panes[0]?.id ?? null
  const bare = panes.length === 0
  const pageHidden = bare ? false : layout.pageHidden
  const terminalsHidden = bare ? false : layout.terminalsHidden
  if (
    focused === layout.focused &&
    pageHidden === layout.pageHidden &&
    terminalsHidden === layout.terminalsHidden
  )
    return layout
  return { ...layout, focused, pageHidden, terminalsHidden }
}

export function insertAt(
  layout: PaneLayout,
  beside: string,
  edge: Edge,
  leaf: LayoutNode,
  newId: NewId,
  share = 50,
): PaneLayout {
  const root = insertNode(layout.root, beside, edge, leaf, newId, share)
  return root === layout.root ? layout : settle({ ...layout, root })
}

// Shows the session's tab and focuses its pane.
export function activate(layout: PaneLayout, session: string): PaneLayout {
  const pane = paneOf(layout.root, session)
  if (pane === undefined) return layout
  if (
    pane.active === session &&
    layout.focused === pane.id &&
    !layout.terminalsHidden
  )
    return layout
  return {
    ...layout,
    root: replaceNode(layout.root, pane.id, { ...pane, active: session }),
    focused: pane.id,
    terminalsHidden: false,
  }
}

// The session's tab leaves its pane; the next tab takes over, else the one before. A pane left
// empty goes, and focus moves to the pane before it in the tree, else the one after.
export function removeSession(layout: PaneLayout, session: string): PaneLayout {
  const pane = paneOf(layout.root, session)
  if (pane === undefined) return layout
  if (pane.tabs.length > 1) {
    const at = pane.tabs.indexOf(session)
    const tabs = pane.tabs.filter((tab) => tab !== session)
    const active =
      pane.active === session
        ? tabs[Math.min(at, tabs.length - 1)]
        : pane.active
    return {
      ...layout,
      root: replaceNode(layout.root, pane.id, { ...pane, tabs, active }),
    }
  }
  const panes = terminalPanes(layout.root)
  const at = panes.indexOf(pane)
  const heir = panes[at - 1] ?? panes[at + 1]
  return settle({
    ...layout,
    root: removeNode(layout.root, pane.id),
    focused: layout.focused === pane.id ? (heir?.id ?? null) : layout.focused,
  })
}

function newPane(session: string, newId: NewId): TerminalLeaf {
  return { kind: 'terminals', id: newId(), tabs: [session], active: session }
}

// A session that isn't in a pane yet joins the focused one as its active tab, or a new pane right
// of the page when there's none. `reveal` shows the terminals and focuses that pane.
function addSession(
  layout: PaneLayout,
  session: string,
  newId: NewId,
  reveal: boolean,
): PaneLayout {
  const target =
    findPane(layout.root, layout.focused) ?? terminalPanes(layout.root)[0]
  if (target === undefined) {
    const pane = newPane(session, newId)
    const placed = insertAt(
      layout,
      PAGE.id,
      'right',
      pane,
      newId,
      NEW_PANE_SHARE,
    )
    return reveal
      ? { ...placed, focused: pane.id, terminalsHidden: false }
      : placed
  }
  const pane = { ...target, tabs: [...target.tabs, session], active: session }
  const root = replaceNode(layout.root, target.id, pane)
  return reveal
    ? { ...layout, root, focused: pane.id, terminalsHidden: false }
    : { ...layout, root }
}

// Where a session the page just opened goes: beside a pane when `where` says, else into the
// focused pane. One already placed (the list refetched first) is activated or moved there.
export function placeSession(
  layout: PaneLayout,
  session: string,
  newId: NewId,
  where?: { beside: string; edge: Edge },
): PaneLayout {
  const placed = paneOf(layout.root, session) !== undefined
  if (where !== undefined) {
    if (placed) return moveTab(layout, session, where, newId)
    const pane = newPane(session, newId)
    const inserted = insertAt(layout, where.beside, where.edge, pane, newId)
    return { ...inserted, focused: pane.id, terminalsHidden: false }
  }
  return placed
    ? activate(layout, session)
    : addSession(layout, session, newId, true)
}

// The layout for the sessions the server lists: ids it no longer lists are dropped, and listed
// ones not in a pane are added without stealing focus. Ids it makes come from the session they
// were made for, so the same input gives the same tree on every render.
export function reconcile(
  layout: PaneLayout,
  sessions: readonly string[],
): PaneLayout {
  const listed = new Set(sessions)
  let next = layout
  for (const session of placedSessions(layout.root)) {
    if (!listed.has(session)) next = removeSession(next, session)
  }
  const placed = new Set(placedSessions(next.root))
  for (const session of sessions) {
    if (placed.has(session)) continue
    let count = 0
    next = addSession(next, session, () => `auto-${session}-${count++}`, false)
  }
  return next
}

export function moveTab(
  layout: PaneLayout,
  session: string,
  to: TabTarget,
  newId: NewId,
): PaneLayout {
  const source = paneOf(layout.root, session)
  if (source === undefined) return layout
  if ('pane' in to) {
    const target = findPane(layout.root, to.pane)
    if (target === undefined) return layout
    if (target.id === source.id) {
      const from = source.tabs.indexOf(session)
      const tabs = source.tabs.filter((tab) => tab !== session)
      const index = Math.min(
        to.index > from ? to.index - 1 : to.index,
        tabs.length,
      )
      tabs.splice(index, 0, session)
      if (tabs.every((tab, at) => tab === source.tabs[at]))
        return activate(layout, session)
      return activate(
        {
          ...layout,
          root: replaceNode(layout.root, source.id, { ...source, tabs }),
        },
        session,
      )
    }
    const removed = removeSession(layout, session)
    const into = findPane(removed.root, target.id)
    if (into === undefined) return layout
    const tabs = [...into.tabs]
    tabs.splice(Math.min(to.index, tabs.length), 0, session)
    return {
      ...removed,
      root: replaceNode(removed.root, into.id, {
        ...into,
        tabs,
        active: session,
      }),
      focused: into.id,
      terminalsHidden: false,
    }
  }
  if (to.beside === source.id && source.tabs.length === 1) return layout
  const removed = removeSession(layout, session)
  const pane = newPane(session, newId)
  const inserted = insertAt(removed, to.beside, to.edge, pane, newId)
  if (inserted === removed) return layout
  return { ...inserted, focused: pane.id, terminalsHidden: false }
}

// The page goes on `edge` of a terminal pane; it's still the only page leaf.
export function movePage(
  layout: PaneLayout,
  beside: string,
  edge: Edge,
  newId: NewId,
): PaneLayout {
  if (beside === PAGE.id || findPane(layout.root, beside) === undefined)
    return layout
  const root = insertNode(
    removeNode(layout.root, PAGE.id),
    beside,
    edge,
    PAGE,
    newId,
  )
  return { ...layout, root, pageHidden: false }
}

export function focusPane(layout: PaneLayout, pane: string): PaneLayout {
  if (layout.focused === pane || findPane(layout.root, pane) === undefined)
    return layout
  return { ...layout, focused: pane }
}

// The pane's next or previous tab, wrapping round.
export function cycleTab(
  layout: PaneLayout,
  paneId: string,
  step: 1 | -1,
): PaneLayout {
  const pane = findPane(layout.root, paneId)
  if (pane === undefined || pane.tabs.length < 2) return layout
  const at = pane.tabs.indexOf(pane.active)
  const next = pane.tabs[(at + step + pane.tabs.length) % pane.tabs.length]
  return activate(layout, next)
}

export function setSizes(
  layout: PaneLayout,
  splitId: string,
  sizes: number[],
): PaneLayout {
  const find = (node: LayoutNode): SplitNode | undefined =>
    node.kind !== 'split'
      ? undefined
      : node.id === splitId
        ? node
        : node.children.map(find).find((found) => found !== undefined)
  const split = find(layout.root)
  if (
    split === undefined ||
    sizes.length !== split.children.length ||
    sizes.every((size, at) => Math.abs(size - split.sizes[at]) < 0.01)
  )
    return layout
  return {
    ...layout,
    root: replaceNode(layout.root, splitId, { ...split, sizes }),
  }
}

// The page and the terminals can't both be hidden: hiding one shows the other. With no terminal
// pane, neither hides.
export function setHidden(
  layout: PaneLayout,
  part: 'page' | 'terminals',
  hidden: boolean,
): PaneLayout {
  if (hidden && terminalPanes(layout.root).length === 0) return layout
  const pageHidden =
    part === 'page' ? hidden : hidden ? false : layout.pageHidden
  const terminalsHidden =
    part === 'terminals' ? hidden : hidden ? false : layout.terminalsHidden
  if (
    pageHidden === layout.pageHidden &&
    terminalsHidden === layout.terminalsHidden
  )
    return layout
  return { ...layout, pageHidden, terminalsHidden }
}

// What's on screen: the tree without its hidden leaves, their room given to their neighbours.
export function visibleTree(layout: PaneLayout): LayoutNode {
  const { root, pageHidden, terminalsHidden } = settle(layout)
  if (terminalsHidden) return PAGE
  return pageHidden ? removeNode(root, PAGE.id) : root
}

// ---- geometry ----

export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

const EPSILON = 1e-6

function boxes(
  node: LayoutNode,
  box: Rect,
  out: Map<string, Rect>,
): Map<string, Rect> {
  if (node.kind !== 'split') return out.set(node.id, box)
  let offset = 0
  node.children.forEach((child, at) => {
    const share = node.sizes[at] / 100
    boxes(
      child,
      node.direction === 'row'
        ? {
            left: box.left + offset * box.width,
            top: box.top,
            width: box.width * share,
            height: box.height,
          }
        : {
            left: box.left,
            top: box.top + offset * box.height,
            width: box.width,
            height: box.height * share,
          },
      out,
    )
    offset += share
  })
  return out
}

// The leaf across `edge` of leaf `from` that shares the most of that edge with it, ties going to
// the top or the left; null at the outside of the tree.
export function neighbour(
  root: LayoutNode,
  from: string,
  edge: Edge,
): string | null {
  const laid = boxes(root, { left: 0, top: 0, width: 1, height: 1 }, new Map())
  const origin = laid.get(from)
  if (origin === undefined) return null
  const along = axis(edge) === 'row'
  const line =
    edge === 'left'
      ? origin.left
      : edge === 'right'
        ? origin.left + origin.width
        : edge === 'top'
          ? origin.top
          : origin.top + origin.height
  let best: { id: string; overlap: number; start: number } | null = null
  for (const [id, box] of laid) {
    if (id === from) continue
    const facing =
      edge === 'left'
        ? box.left + box.width
        : edge === 'right'
          ? box.left
          : edge === 'top'
            ? box.top + box.height
            : box.top
    if (Math.abs(facing - line) > EPSILON) continue
    const [start, end, originStart, originEnd] = along
      ? [box.top, box.top + box.height, origin.top, origin.top + origin.height]
      : [
          box.left,
          box.left + box.width,
          origin.left,
          origin.left + origin.width,
        ]
    const overlap = Math.min(end, originEnd) - Math.max(start, originStart)
    if (overlap <= EPSILON) continue
    if (
      best === null ||
      overlap > best.overlap + EPSILON ||
      (Math.abs(overlap - best.overlap) <= EPSILON && start < best.start)
    )
      best = { id, overlap, start }
  }
  return best?.id ?? null
}

// Where a dragged tab would land on a pane: the outer quarter on each side is that edge (a corner
// goes to the nearer one), the rest is the centre.
export function dropZone(
  rect: Rect,
  point: { x: number; y: number },
): DropZone {
  const x = (point.x - rect.left) / rect.width
  const y = (point.y - rect.top) / rect.height
  const distances: [DropZone, number][] = [
    ['left', x],
    ['right', 1 - x],
    ['top', y],
    ['bottom', 1 - y],
  ]
  const [edge, distance] = distances.reduce((nearest, each) =>
    each[1] < nearest[1] ? each : nearest,
  )
  return distance < 0.25 ? edge : 'centre'
}
