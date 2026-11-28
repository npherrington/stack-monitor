// A stack map file to React Flow's nodes and edges and back. The file format is ours
// (core/feature-map/schema.ts); React Flow's shapes stay in the page, so a React Flow upgrade
// changes this file, never a map in someone's repo. Only types come from the library, so node
// can test this without loading it.
import type { Edge, Node } from '@xyflow/react'

import type {
  BlockInfo,
  BlockKind,
  StackMap,
  StackMapStarter,
} from '../../core/types.ts'

// What a palette block carries when it's dragged onto the canvas: the block's id.
export const BLOCK_DRAG_TYPE = 'application/x-stack-map-block'

export interface MapNodeData extends Record<string, unknown> {
  block: string // the block's id
  label: string
  note: string
  blockName: string // the block's name when the map opened
  kind: BlockKind | null // null: the repo no longer has this block
}

export type MapNode = Node<MapNodeData, 'block'>

export function blankMap(): StackMap {
  return {
    version: 1,
    title: 'Untitled map',
    starter: false,
    nodes: [],
    edges: [],
  }
}

// A starter's map to start from: a copy of its own, not offered as a starter in turn.
export function starterCopy(starter: StackMapStarter): StackMap {
  return { ...structuredClone(starter.map), starter: false }
}

export function toCanvas(
  map: StackMap,
  blocks: BlockInfo[],
): { nodes: MapNode[]; edges: Edge[] } {
  const known = new Map(blocks.map((block) => [block.id, block]))
  return {
    nodes: map.nodes.map((node): MapNode => {
      const block = known.get(node.block)
      return {
        id: node.id,
        type: 'block',
        position: { x: node.x, y: node.y },
        data: {
          block: node.block,
          label: node.label,
          note: node.note ?? '',
          blockName: block?.name ?? node.block,
          kind: block?.kind ?? null,
        },
      }
    }),
    edges: map.edges.map((edge): Edge => ({
      id: edge.id,
      source: edge.from,
      target: edge.to,
      label: edge.label,
      markerEnd: { type: 'arrowclosed' },
    })),
  }
}

// What the canvas holds, as a file: positions rounded, an empty note or label left out.
export function fromCanvas(
  meta: { title: string; starter: boolean },
  nodes: MapNode[],
  edges: Edge[],
): StackMap {
  return {
    version: 1,
    title: meta.title,
    starter: meta.starter,
    nodes: nodes.map((node) => ({
      id: node.id,
      block: node.data.block,
      label: node.data.label,
      ...(node.data.note === '' ? {} : { note: node.data.note }),
      x: Math.round(node.position.x),
      y: Math.round(node.position.y),
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      from: edge.source,
      to: edge.target,
      ...(typeof edge.label === 'string' && edge.label !== ''
        ? { label: edge.label }
        : {}),
    })),
  }
}

// Both made by fromCanvas, so their keys come in one order.
export function sameMap(a: StackMap, b: StackMap): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

// The first n1, n2… (or e1, e2…) that isn't taken.
export function freshId(prefix: 'n' | 'e', taken: ReadonlySet<string>): string {
  let number = taken.size + 1
  while (taken.has(`${prefix}${number}`)) number += 1
  return `${prefix}${number}`
}
