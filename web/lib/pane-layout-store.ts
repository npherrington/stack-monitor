// The pane layout and the tabs' names and colours, kept per browser like the checkout prefs. The
// server keeps none of it. What an older or hand-edited page wrote is checked against every rule
// of the tree, and anything that breaks one starts from the default.
// Relative imports: tests/pane-layout.test.ts runs this file under node.
import {
  DEFAULT_LAYOUT,
  leaves,
  type LayoutNode,
  type PaneLayout,
  type TabStyle,
  type TabStyles,
} from './pane-layout.ts'
import { isSwatch } from './swatches.ts'

const LAYOUT_KEY = 'stack-monitor:pane-layout'
const OLD_WIDTH_KEY = 'stack-monitor:terminal-width' // the old panel's, read by nothing now

export interface StoredLayout {
  layout: PaneLayout
  tabStyles: TabStyles
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isString = (value: unknown): value is string => typeof value === 'string'

function parseNode(value: unknown): LayoutNode | null {
  if (!isRecord(value)) return null
  if (value.kind === 'page')
    return value.id === 'page' ? { kind: 'page', id: 'page' } : null
  if (value.kind === 'terminals') {
    const { id, tabs, active } = value
    if (!isString(id) || !Array.isArray(tabs) || tabs.length === 0) return null
    if (!tabs.every(isString) || !isString(active) || !tabs.includes(active))
      return null
    return { kind: 'terminals', id, tabs, active }
  }
  if (value.kind === 'split') {
    const { id, direction, children, sizes } = value
    if (!isString(id) || (direction !== 'row' && direction !== 'column'))
      return null
    if (!Array.isArray(children) || children.length < 2) return null
    if (!Array.isArray(sizes) || sizes.length !== children.length) return null
    if (!sizes.every((size) => typeof size === 'number' && size >= 0))
      return null
    const parsed = children.map(parseNode)
    if (parsed.some((child) => child === null)) return null
    return {
      kind: 'split',
      id,
      direction,
      children: parsed as LayoutNode[],
      sizes,
    }
  }
  return null
}

export function parseLayout(value: unknown): PaneLayout {
  if (!isRecord(value)) return DEFAULT_LAYOUT
  const root = parseNode(value.root)
  if (root === null) return DEFAULT_LAYOUT
  const all = leaves(root)
  const tabs = all.flatMap((leaf) =>
    leaf.kind === 'terminals' ? leaf.tabs : [],
  )
  if (all.filter((leaf) => leaf.kind === 'page').length !== 1)
    return DEFAULT_LAYOUT
  if (new Set(tabs).size !== tabs.length) return DEFAULT_LAYOUT
  return {
    root,
    focused: isString(value.focused) ? value.focused : null,
    pageHidden: value.pageHidden === true,
    terminalsHidden: value.terminalsHidden === true,
  }
}

export function parseTabStyles(value: unknown): TabStyles {
  if (!isRecord(value)) return {}
  const styles: TabStyles = {}
  for (const [id, raw] of Object.entries(value)) {
    if (!isRecord(raw)) continue
    const style: TabStyle = {}
    const name = isString(raw.name) ? raw.name.trim() : ''
    if (name !== '') style.name = name
    if (isSwatch(raw.colour)) style.colour = raw.colour
    if (style.name !== undefined || style.colour !== undefined)
      styles[id] = style
  }
  return styles
}

export function readLayout(): StoredLayout {
  try {
    localStorage.removeItem(OLD_WIDTH_KEY)
    const raw: unknown = JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? 'null')
    return {
      layout: parseLayout(isRecord(raw) ? raw.layout : null),
      tabStyles: parseTabStyles(isRecord(raw) ? raw.tabStyles : null),
    }
  } catch {
    return { layout: DEFAULT_LAYOUT, tabStyles: {} }
  }
}

export function storeLayout(stored: StoredLayout): void {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(stored))
  } catch {
    // The arrangement lasts until the page reloads.
  }
}
