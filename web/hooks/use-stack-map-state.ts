import {
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type OnEdgesChange,
  type OnNodesChange,
  type XYPosition,
} from '@xyflow/react'
import { useCallback, useMemo, useState } from 'react'

import type { BlockInfo, StackMap } from '../../core/types.ts'
import {
  freshId,
  fromCanvas,
  sameMap,
  toCanvas,
  type MapNode,
} from '@/lib/stack-map-canvas.ts'

export type SelectedElement =
  { kind: 'node'; node: MapNode } | { kind: 'edge'; edge: Edge }

interface UseStackMapStateResult {
  nodes: MapNode[]
  edges: Edge[]
  onNodesChange: OnNodesChange<MapNode>
  onEdgesChange: OnEdgesChange<Edge>
  onConnect: (connection: Connection) => void
  meta: { title: string; starter: boolean }
  selected: SelectedElement | null // the one block or arrow selected, when it's exactly one
  current: StackMap // what the canvas holds, as a file
  isDirty: boolean // the canvas differs from what was last saved
  addBlock: (block: BlockInfo, position: XYPosition) => void
  updateNode: (id: string, change: { label?: string; note?: string }) => void
  updateEdge: (id: string, label: string) => void
  remove: (kind: 'node' | 'edge', id: string) => void
  markSaved: (map: StackMap) => void
}

const ARROW = { type: 'arrowclosed' } as const

// The map is taken once, so mount it with a key that changes when another map opens.
export function useStackMapState(
  start: StackMap,
  blocks: BlockInfo[],
): UseStackMapStateResult {
  const [initial] = useState(() => toCanvas(start, blocks))
  const [nodes, setNodes, onNodesChange] = useNodesState<MapNode>(initial.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initial.edges)
  const [meta, setMeta] = useState({
    title: start.title,
    starter: start.starter,
  })
  // As fromCanvas writes it, so a file with an empty note isn't unsaved from the start.
  const [saved, setSaved] = useState(() =>
    fromCanvas(meta, initial.nodes, initial.edges),
  )

  const current = useMemo(
    () => fromCanvas(meta, nodes, edges),
    [meta, nodes, edges],
  )
  const isDirty = !sameMap(current, saved)

  const selected = useMemo((): SelectedElement | null => {
    const picked = [
      ...nodes
        .filter((node) => node.selected === true)
        .map((node): SelectedElement => ({ kind: 'node', node })),
      ...edges
        .filter((edge) => edge.selected === true)
        .map((edge): SelectedElement => ({ kind: 'edge', edge })),
    ]
    return picked.length === 1 ? picked[0] : null
  }, [nodes, edges])

  const onConnect = useCallback(
    ({ source: from, target: to }: Connection) => {
      setEdges((all) => {
        if (all.some((edge) => edge.source === from && edge.target === to)) {
          return all
        }
        const id = freshId('e', new Set(all.map((edge) => edge.id)))
        return [...all, { id, source: from, target: to, markerEnd: ARROW }]
      })
    },
    [setEdges],
  )

  // The new block is the selection, so the inspector shows it.
  const addBlock = useCallback(
    (block: BlockInfo, position: XYPosition) => {
      setNodes((all) => {
        const id = freshId('n', new Set(all.map((node) => node.id)))
        const added: MapNode = {
          id,
          type: 'block',
          position,
          selected: true,
          data: {
            block: block.id,
            label: '',
            note: '',
            blockName: block.name,
            kind: block.kind,
          },
        }
        return [...all.map((node) => ({ ...node, selected: false })), added]
      })
      setEdges((all) => all.map((edge) => ({ ...edge, selected: false })))
    },
    [setNodes, setEdges],
  )

  const updateNode = useCallback(
    (id: string, change: { label?: string; note?: string }) =>
      setNodes((all) =>
        all.map((node) =>
          node.id === id
            ? { ...node, data: { ...node.data, ...change } }
            : node,
        ),
      ),
    [setNodes],
  )

  const updateEdge = useCallback(
    (id: string, label: string) =>
      setEdges((all) =>
        all.map((edge) => (edge.id === id ? { ...edge, label } : edge)),
      ),
    [setEdges],
  )

  const remove = useCallback(
    (kind: 'node' | 'edge', id: string) => {
      if (kind === 'node') {
        setNodes((all) => all.filter((node) => node.id !== id))
        setEdges((all) =>
          all.filter((edge) => edge.source !== id && edge.target !== id),
        )
      } else {
        setEdges((all) => all.filter((edge) => edge.id !== id))
      }
    },
    [setNodes, setEdges],
  )

  const markSaved = useCallback((map: StackMap) => {
    setSaved(map)
    setMeta({ title: map.title, starter: map.starter })
  }, [])

  return useMemo(
    () => ({
      nodes,
      edges,
      onNodesChange,
      onEdgesChange,
      onConnect,
      meta,
      selected,
      current,
      isDirty,
      addBlock,
      updateNode,
      updateEdge,
      remove,
      markSaved,
    }),
    [
      nodes,
      edges,
      onNodesChange,
      onEdgesChange,
      onConnect,
      meta,
      selected,
      current,
      isDirty,
      addBlock,
      updateNode,
      updateEdge,
      remove,
      markSaved,
    ],
  )
}
