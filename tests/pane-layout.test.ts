import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  DEFAULT_LAYOUT,
  PAGE,
  dropZone,
  leaves,
  moveTab,
  movePage,
  neighbour,
  paneOf,
  placeSession,
  reconcile,
  removeSession,
  setHidden,
  visibleTree,
  type LayoutNode,
  type PaneLayout,
  type SplitNode,
  type TerminalLeaf,
} from '../web/lib/pane-layout.ts'
import { parseLayout, parseTabStyles } from '../web/lib/pane-layout-store.ts'

function ids(): () => string {
  let next = 0
  return () => `n${next++}`
}

function pane(id: string, tabs: string[], active = tabs[0]): TerminalLeaf {
  return { kind: 'terminals', id, tabs, active }
}

function split(
  id: string,
  direction: 'row' | 'column',
  children: LayoutNode[],
  sizes: number[],
): SplitNode {
  return { kind: 'split', id, direction, children, sizes }
}

function layout(root: LayoutNode, focused: string | null = null): PaneLayout {
  return { ...DEFAULT_LAYOUT, root, focused }
}

// page | a[s1, s2]
const pageAndA = layout(
  split('root', 'row', [PAGE, pane('a', ['s1', 's2'])], [60, 40]),
  'a',
)

describe('placeSession', () => {
  test('a new session joins the focused pane as its active tab', () => {
    const next = placeSession(pageAndA, 's3', ids())
    assert.deepEqual(
      paneOf(next.root, 's3'),
      pane('a', ['s1', 's2', 's3'], 's3'),
    )
  })

  test('a session already placed is activated where it is', () => {
    const next = placeSession(
      { ...pageAndA, terminalsHidden: true },
      's2',
      ids(),
    )
    assert.equal(paneOf(next.root, 's2')?.active, 's2')
    assert.equal(next.terminalsHidden, false)
  })

  test('with no terminal pane, it makes one right of the page at 40%', () => {
    const next = placeSession(DEFAULT_LAYOUT, 's1', ids())
    assert.deepEqual(
      next.root,
      split('n1', 'row', [PAGE, pane('n0', ['s1'])], [60, 40]),
    )
    assert.equal(next.focused, 'n0')
  })

  test('beside a pane, it makes a new pane on that side', () => {
    const next = placeSession(pageAndA, 's3', ids(), {
      beside: 'a',
      edge: 'bottom',
    })
    const root = next.root as SplitNode
    assert.deepEqual(
      root.children[1],
      split(
        'n1',
        'column',
        [pane('a', ['s1', 's2']), pane('n0', ['s3'])],
        [50, 50],
      ),
    )
    assert.equal(next.focused, 'n0')
  })
})

describe('insertion', () => {
  test('along the parent split, the new pane is a sibling taking half its neighbour', () => {
    const next = placeSession(pageAndA, 's3', ids(), {
      beside: 'a',
      edge: 'right',
    })
    const root = next.root as SplitNode
    assert.deepEqual(
      root.children.map((child) => child.id),
      ['page', 'a', 'n0'],
    )
    assert.deepEqual(root.sizes, [60, 20, 20])
  })
})

describe('removeSession', () => {
  test('the next tab takes over, else the one before', () => {
    const three = layout(
      split(
        'root',
        'row',
        [PAGE, pane('a', ['s1', 's2', 's3'], 's2')],
        [60, 40],
      ),
      'a',
    )
    assert.equal(paneOf(removeSession(three, 's2').root, 's1')?.active, 's3')
    const last = layout(
      split('root', 'row', [PAGE, pane('a', ['s1', 's2'], 's2')], [60, 40]),
      'a',
    )
    assert.equal(paneOf(removeSession(last, 's2').root, 's1')?.active, 's1')
  })

  test("a pane's last tab removes the pane; its neighbour takes the room and the focus", () => {
    const two = layout(
      split(
        'root',
        'row',
        [PAGE, pane('a', ['s1']), pane('b', ['s2'])],
        [50, 25, 25],
      ),
      'b',
    )
    const next = removeSession(two, 's2')
    assert.deepEqual(
      next.root,
      split('root', 'row', [PAGE, pane('a', ['s1'])], [50, 50]),
    )
    assert.equal(next.focused, 'a')
  })

  test('a split left with one child becomes that child', () => {
    const nested = layout(
      split(
        'root',
        'row',
        [
          PAGE,
          split(
            'col',
            'column',
            [pane('a', ['s1']), pane('b', ['s2'])],
            [50, 50],
          ),
        ],
        [60, 40],
      ),
      'a',
    )
    const next = removeSession(nested, 's2')
    assert.deepEqual(
      next.root,
      split('root', 'row', [PAGE, pane('a', ['s1'])], [60, 40]),
    )
  })

  test('the last terminal pane going leaves the page alone and nothing hidden', () => {
    const only = {
      ...layout(split('root', 'row', [PAGE, pane('a', ['s1'])], [60, 40]), 'a'),
      pageHidden: true,
    }
    assert.deepEqual(removeSession(only, 's1'), DEFAULT_LAYOUT)
  })
})

describe('reconcile', () => {
  test('drops ids no longer listed and adds listed ones without stealing focus', () => {
    const next = reconcile({ ...pageAndA, terminalsHidden: true }, ['s2', 's9'])
    assert.deepEqual(paneOf(next.root, 's9')?.tabs, ['s2', 's9'])
    assert.equal(next.terminalsHidden, true)
  })

  test('the same sessions give the same tree, and an unchanged layout comes back as is', () => {
    assert.deepEqual(
      reconcile(DEFAULT_LAYOUT, ['s1']),
      reconcile(DEFAULT_LAYOUT, ['s1']),
    )
    assert.equal(reconcile(pageAndA, ['s1', 's2']), pageAndA)
  })
})

describe('setHidden', () => {
  test('never hides both parts, nor anything with no terminal pane', () => {
    const hidden = setHidden(
      setHidden(pageAndA, 'page', true),
      'terminals',
      true,
    )
    assert.equal(hidden.pageHidden, false)
    assert.equal(hidden.terminalsHidden, true)
    assert.equal(setHidden(DEFAULT_LAYOUT, 'page', true), DEFAULT_LAYOUT)
  })
})

describe('visibleTree', () => {
  test('drops hidden leaves and gives their room to the neighbours', () => {
    const three = layout(
      split(
        'root',
        'row',
        [PAGE, pane('a', ['s1']), pane('b', ['s2'])],
        [50, 25, 25],
      ),
      'a',
    )
    assert.deepEqual(
      visibleTree({ ...three, pageHidden: true }),
      split('root', 'row', [pane('a', ['s1']), pane('b', ['s2'])], [75, 25]),
    )
    assert.equal(visibleTree({ ...three, terminalsHidden: true }), PAGE)
  })
})

describe('moveTab', () => {
  test("dropping a pane's only tab on its own edge changes nothing", () => {
    const single = layout(
      split('root', 'row', [PAGE, pane('a', ['s1'])], [60, 40]),
      'a',
    )
    assert.equal(
      moveTab(single, 's1', { beside: 'a', edge: 'right' }, ids()),
      single,
    )
  })

  test('moving the last tab out of a pane removes it', () => {
    const two = layout(
      split(
        'root',
        'row',
        [PAGE, pane('a', ['s1']), pane('b', ['s2'])],
        [50, 25, 25],
      ),
      'a',
    )
    const next = moveTab(two, 's1', { pane: 'b', index: 0 }, ids())
    assert.deepEqual(
      next.root,
      split('root', 'row', [PAGE, pane('b', ['s1', 's2'], 's1')], [75, 25]),
    )
    assert.equal(next.focused, 'b')
  })

  test('reorders within a strip', () => {
    const three = layout(
      split('root', 'row', [PAGE, pane('a', ['s1', 's2', 's3'])], [60, 40]),
      'a',
    )
    const next = moveTab(three, 's1', { pane: 'a', index: 3 }, ids())
    assert.deepEqual(paneOf(next.root, 's1')?.tabs, ['s2', 's3', 's1'])
  })
})

describe('movePage', () => {
  test('keeps exactly one page leaf', () => {
    const next = movePage(pageAndA, 'a', 'bottom', ids())
    assert.deepEqual(
      next.root,
      split('n0', 'column', [pane('a', ['s1', 's2']), PAGE], [50, 50]),
    )
    assert.equal(
      leaves(next.root).filter((leaf) => leaf.kind === 'page').length,
      1,
    )
  })
})

describe('neighbour', () => {
  // page | (a / b) | c, with b's top edge level with the page's middle
  const root = split(
    'root',
    'row',
    [
      PAGE,
      split('col', 'column', [pane('a', ['s1']), pane('b', ['s2'])], [50, 50]),
      pane('c', ['s3']),
    ],
    [40, 30, 30],
  )

  test('crosses splits and picks the leaf sharing most of the edge', () => {
    assert.equal(neighbour(root, 'a', 'bottom'), 'b')
    assert.equal(neighbour(root, 'b', 'left'), 'page')
    assert.equal(neighbour(root, 'b', 'right'), 'c')
  })

  test('ties go to the top or the left, and the outside is null', () => {
    assert.equal(neighbour(root, 'page', 'right'), 'a')
    assert.equal(neighbour(root, 'c', 'left'), 'a')
    assert.equal(neighbour(root, 'page', 'left'), null)
  })
})

describe('dropZone', () => {
  const rect = { left: 0, top: 0, width: 100, height: 100 }

  test("each edge's outer quarter, the centre, and corners to the nearer edge", () => {
    const cases: [number, number, string][] = [
      [10, 50, 'left'],
      [90, 50, 'right'],
      [50, 10, 'top'],
      [50, 90, 'bottom'],
      [50, 50, 'centre'],
      [5, 15, 'left'],
      [15, 5, 'top'],
    ]
    for (const [x, y, zone] of cases)
      assert.equal(dropZone(rect, { x, y }), zone, `${x},${y}`)
  })
})

describe('parseLayout', () => {
  test('anything that breaks a rule of the tree gives the default', () => {
    const bad: unknown[] = [
      null,
      'not a layout',
      { root: { kind: 'page', id: 'other' } },
      { root: split('r', 'row', [PAGE, PAGE], [50, 50]) },
      { root: split('r', 'row', [PAGE, pane('a', [])], [50, 50]) },
      { root: split('r', 'row', [PAGE, pane('a', ['s1'])], [100]) },
      { root: split('r', 'row', [PAGE, pane('a', ['s1'], 's2')], [50, 50]) },
      {
        root: split(
          'r',
          'row',
          [PAGE, pane('a', ['s1']), pane('b', ['s1'])],
          [50, 25, 25],
        ),
      },
      {
        root: split(
          'r',
          'diagonal' as 'row',
          [PAGE, pane('a', ['s1'])],
          [50, 50],
        ),
      },
    ]
    for (const value of bad)
      assert.deepEqual(
        parseLayout(value),
        DEFAULT_LAYOUT,
        JSON.stringify(value),
      )
  })

  test('a good layout reads back as it was', () => {
    assert.deepEqual(parseLayout(pageAndA), pageAndA)
  })

  test('tab styles keep names and known swatches only', () => {
    assert.deepEqual(
      parseTabStyles({
        s1: { name: ' api ', colour: 'teal' },
        s2: { colour: 'magenta' },
        s3: 'x',
      }),
      { s1: { name: 'api', colour: 'teal' } },
    )
  })
})
