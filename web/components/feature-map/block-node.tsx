import { Handle, Position, type NodeProps } from '@xyflow/react'
import { CircleHelp } from 'lucide-react'

import { KIND_ICONS } from '@/components/feature-map/block-kinds.ts'
import { cn } from '@/lib/utils.ts'
import type { MapNode } from '@/lib/stack-map-canvas.ts'

// A block on the canvas: its kind's icon, what it's called on this map and, beneath it, which
// block it is. React Flow takes away the focus outline on its wrapper, so the ring is ours.
export function BlockNode({ data, selected }: NodeProps<MapNode>) {
  const Icon = data.kind === null ? CircleHelp : KIND_ICONS[data.kind]
  const named = data.label !== ''
  return (
    <div
      className={cn(
        'flex w-44 items-center gap-2 rounded-lg border bg-card px-3 py-2 text-card-foreground shadow-sm in-focus-visible:ring-2 in-focus-visible:ring-ring',
        selected && 'border-primary ring-2 ring-primary',
      )}
    >
      <Handle type="target" position={Position.Left} />
      <Icon
        aria-hidden="true"
        className="size-4 shrink-0 text-muted-foreground"
      />
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-xs font-semibold text-strong">
          {named ? data.label : data.blockName}
        </span>
        {data.kind === null ? (
          <span className="truncate text-[11px] text-warning">
            Unknown block {data.block}
          </span>
        ) : (
          named && (
            <span className="truncate text-[11px] text-muted-foreground">
              {data.blockName}
            </span>
          )
        )}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}
