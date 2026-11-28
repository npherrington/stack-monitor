import type { BlockInfo } from '../../../core/types.ts'
import {
  KIND_ICONS,
  KIND_LABELS,
} from '@/components/feature-map/block-kinds.ts'
import { Button } from '@/components/ui/button.tsx'
import type { PaletteGroup } from '@/hooks/use-feature-map.ts'
import { BLOCK_DRAG_TYPE } from '@/lib/stack-map-canvas.ts'

interface BlockPaletteProps {
  palette: PaletteGroup[]
  onAdd: (block: BlockInfo) => void // at the centre of the canvas
}

// Drag a block onto the canvas, or click it to add it.
export function BlockPalette({ palette, onAdd }: BlockPaletteProps) {
  return (
    <div className="flex flex-col gap-4">
      {palette.map(({ kind, blocks }) => {
        const Icon = KIND_ICONS[kind]
        return (
          <section key={kind} className="flex flex-col gap-1.5">
            <h2 className="px-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              {KIND_LABELS[kind]}
            </h2>
            <ul className="flex flex-col gap-1">
              {blocks.map((block) => (
                <li key={block.id}>
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData(BLOCK_DRAG_TYPE, block.id)
                      event.dataTransfer.effectAllowed = 'move'
                    }}
                    onClick={() => onAdd(block)}
                  >
                    <Icon aria-hidden="true" />
                    <span className="truncate">{block.name}</span>
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
