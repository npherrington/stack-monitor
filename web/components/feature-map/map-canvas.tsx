import {
  Background,
  Controls,
  ReactFlow,
  useReactFlow,
  type Connection,
  type Edge,
  type OnEdgesChange,
  type OnNodesChange,
  type XYPosition,
} from '@xyflow/react'
import type { DragEvent } from 'react'

import { BlockNode } from '@/components/feature-map/block-node.tsx'
import { useTheme } from '@/contexts/theme-context.ts'
import { useFitViewOnOpen } from '@/hooks/use-fit-view-on-open.ts'
import { BLOCK_DRAG_TYPE, type MapNode } from '@/lib/stack-map-canvas.ts'
import { themeMode } from '@/lib/theme.ts'

// Kept outside the component: React Flow warns when the node types change on a render.
const NODE_TYPES = { block: BlockNode }
const DELETE_KEYS = ['Backspace', 'Delete']
// Lower than React Flow's 0.5 so a wide map fits when it opens.
const MIN_ZOOM = 0.2

function allowDrop(event: DragEvent) {
  if (!event.dataTransfer.types.includes(BLOCK_DRAG_TYPE)) return
  event.preventDefault()
  event.dataTransfer.dropEffect = 'move'
}

interface MapCanvasProps {
  nodes: MapNode[]
  edges: Edge[]
  onNodesChange: OnNodesChange<MapNode>
  onEdgesChange: OnEdgesChange<Edge>
  onConnect: (connection: Connection) => void
  onDropBlock: (blockId: string, position: XYPosition) => void
}

// Mount it inside a ReactFlowProvider.
export function MapCanvas({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onDropBlock,
}: MapCanvasProps) {
  const { theme } = useTheme()
  const { screenToFlowPosition } = useReactFlow()
  useFitViewOnOpen(nodes.length)

  const drop = (event: DragEvent) => {
    const blockId = event.dataTransfer.getData(BLOCK_DRAG_TYPE)
    if (blockId === '') return
    event.preventDefault()
    onDropBlock(
      blockId,
      screenToFlowPosition({ x: event.clientX, y: event.clientY }),
    )
  }

  return (
    <div className="relative size-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDragOver={allowDrop}
        onDrop={drop}
        deleteKeyCode={DELETE_KEYS}
        forceColorMode={themeMode(theme)}
        minZoom={MIN_ZOOM}
      >
        <Background />
        <Controls />
      </ReactFlow>
      {nodes.length === 0 && (
        <p className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 px-6 text-center text-sm text-muted-foreground">
          Drag a block in from the left, or click one to add it.
        </p>
      )}
    </div>
  )
}
