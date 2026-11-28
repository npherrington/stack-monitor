import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  BUILT_IN_BLOCKS,
  BUILT_IN_STARTERS,
} from '../core/feature-map/built-ins.ts'
import type { BlockInfo, StackMapStarter } from '../core/types.ts'
import {
  fromCanvas,
  sameMap,
  starterCopy,
  toCanvas,
} from '../web/lib/stack-map-canvas.ts'

const blocks: BlockInfo[] = BUILT_IN_BLOCKS.map((block) => ({
  ...block,
  source: 'built-in',
}))

test('a map goes to the canvas and back unchanged', () => {
  const starter: StackMapStarter = {
    ...BUILT_IN_STARTERS[0],
    source: 'built-in',
  }
  const map = starterCopy(starter)
  assert.equal(map.starter, false)
  map.nodes[1].note = 'POST /orders'
  map.edges[1].label = 'validates'
  const meta = { title: map.title, starter: map.starter }

  const { nodes, edges } = toCanvas(map, blocks)
  assert.deepEqual(fromCanvas(meta, nodes, edges), map)

  nodes[0].position = { x: 12.6, y: -3.4 }
  const moved = fromCanvas(meta, nodes, edges)
  assert.deepEqual([moved.nodes[0].x, moved.nodes[0].y], [13, -3])
  assert.equal(sameMap(moved, map), false)

  nodes[2].data = { ...nodes[2].data, label: 'Renamed' }
  assert.equal(sameMap(fromCanvas(meta, nodes, edges), moved), false)

  // A block the repo no longer offers keeps its id and reads as unknown.
  const offered = blocks.filter((block) => block.id !== 'database')
  const lost = toCanvas(map, offered).nodes.at(-1)
  assert.equal(lost?.data.block, 'database')
  assert.equal(lost?.data.kind, null)
})
