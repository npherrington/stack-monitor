import { useNodesInitialized, useReactFlow } from '@xyflow/react'
import { useEffect, useRef, useState } from 'react'

// A single block or a small map opens at its own size, not magnified to fill the pane.
const FIT_OPTIONS = { maxZoom: 1 }

// Fits the view once, when a map that opens with blocks has them measured. Blocks added to the
// open map later don't move the view, so a first drop lands under the pointer. Mount it under a
// key that changes with the open map.
export function useFitViewOnOpen(nodeCount: number): void {
  const { fitView } = useReactFlow()
  const measured = useNodesInitialized()
  const [opensWithBlocks] = useState(nodeCount > 0)
  const fitted = useRef(false)

  useEffect(() => {
    if (!opensWithBlocks || !measured || fitted.current) return
    fitted.current = true
    void fitView(FIT_OPTIONS)
  }, [opensWithBlocks, measured, fitView])
}
