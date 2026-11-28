import { useReactFlow, type XYPosition } from '@xyflow/react'
import { useRef, useState } from 'react'

import type {
  BlockInfo,
  FeatureMapOverview,
  StackMap as StackMapFile,
} from '../../../core/types.ts'
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog.tsx'
import { BlockPalette } from '@/components/feature-map/block-palette.tsx'
import { MapCanvas } from '@/components/feature-map/map-canvas.tsx'
import { MapInspector } from '@/components/feature-map/map-inspector.tsx'
import { MapProblems } from '@/components/feature-map/map-problems.tsx'
import { MapToolbar } from '@/components/feature-map/map-toolbar.tsx'
import { SaveMapDialog } from '@/components/feature-map/save-map-dialog.tsx'
import type { PaletteGroup } from '@/hooks/use-feature-map.ts'
import type { UseStackMapRouteResult } from '@/hooks/use-stack-map-route.ts'
import { useStackMapFlow } from '@/hooks/use-stack-map-flow.ts'
import { useStackMapState } from '@/hooks/use-stack-map-state.ts'

// Half of an unlabelled block on the canvas (w-44, one line), so one dropped or added lands
// centred on the point it was given.
const HALF_BLOCK: XYPosition = { x: 88, y: 17 }
// Each block added by click steps this far from the last, so they don't pile up.
const STEP = 24

interface MapEditorProps {
  root: string
  repos: { root: string; name: string }[]
  overview: FeatureMapOverview
  palette: PaletteGroup[]
  name: string | null // the saved map open; null: an unsaved one
  map: StackMapFile // what it opens with
  route: UseStackMapRouteResult
}

// Mount it inside a ReactFlowProvider, with a key that changes when another map opens: it takes
// the map once.
export function MapEditor({
  root,
  repos,
  overview,
  palette,
  name,
  map,
  route,
}: MapEditorProps) {
  const state = useStackMapState(map, overview.blocks)
  const flow = useStackMapFlow(root, route)
  const { screenToFlowPosition } = useReactFlow()
  const canvas = useRef<HTMLDivElement>(null)
  const [dialog, setDialog] = useState<'save' | 'delete' | null>(null)

  const place = (at: XYPosition, block: BlockInfo) =>
    state.addBlock(block, { x: at.x - HALF_BLOCK.x, y: at.y - HALF_BLOCK.y })

  const addAtCentre = (block: BlockInfo) => {
    const box = canvas.current?.getBoundingClientRect()
    if (box === undefined) return
    const centre = screenToFlowPosition({
      x: box.left + box.width / 2,
      y: box.top + box.height / 2,
    })
    const nudge = (state.nodes.length % 6) * STEP
    place({ x: centre.x + nudge, y: centre.y + nudge }, block)
  }

  const dropBlock = (blockId: string, at: XYPosition) => {
    const block = overview.blocks.find((each) => each.id === blockId)
    if (block !== undefined) place(at, block)
  }

  const save = async () => {
    if (name === null) {
      setDialog('save')
      return
    }
    const saving = state.current
    try {
      await flow.save(name, name, saving)
    } catch {
      return // the toast says why
    }
    state.markSaved(saving)
  }

  const saveAs = async (values: {
    title: string
    name: string
    starter: boolean
  }) => {
    const saving = {
      ...state.current,
      title: values.title,
      starter: values.starter,
    }
    await flow.save(name, values.name, saving)
    state.markSaved(saving)
  }

  return (
    <div className="flex flex-col gap-4">
      <MapToolbar
        repos={repos}
        root={root}
        maps={overview.maps}
        starters={overview.starters}
        name={name}
        isDirty={state.isDirty}
        isSaving={flow.isSaving}
        onPickRepo={route.openRepo}
        onPickMap={(next) => route.openMap(root, next)}
        onNew={(next) => route.startDraft(root, next)}
        onSave={() => void save()}
        onDetails={() => setDialog('save')}
        onDelete={() => setDialog('delete')}
      />
      <MapProblems problems={overview.problems} />
      <div className="grid gap-4 lg:grid-cols-[13rem_minmax(0,1fr)_16rem]">
        <aside aria-label="Blocks">
          <BlockPalette palette={palette} onAdd={addAtCentre} />
        </aside>
        <div
          ref={canvas}
          className="h-[70dvh] min-h-96 overflow-hidden rounded-xl border"
        >
          <MapCanvas
            nodes={state.nodes}
            edges={state.edges}
            onNodesChange={state.onNodesChange}
            onEdgesChange={state.onEdgesChange}
            onConnect={state.onConnect}
            onDropBlock={dropBlock}
          />
        </div>
        <aside aria-label="Selected">
          <MapInspector
            selected={state.selected}
            blocks={overview.blocks}
            onNodeChange={state.updateNode}
            onEdgeLabel={state.updateEdge}
            onRemove={state.remove}
          />
        </aside>
      </div>
      <SaveMapDialog
        open={dialog === 'save'}
        draftName={name}
        title={state.meta.title}
        starter={state.meta.starter}
        folder={overview.folder}
        onSave={saveAs}
        onClose={() => setDialog(null)}
      />
      <ConfirmDeleteDialog
        question={
          dialog === 'delete' && name !== null
            ? {
                title: `Delete ${state.meta.title}?`,
                description: `Removes ${overview.folder}/${name}.json from the repo's primary checkout.`,
                confirmLabel: 'Delete map',
              }
            : null
        }
        onConfirm={() =>
          name === null ? Promise.resolve() : flow.remove(name)
        }
        onClose={() => setDialog(null)}
      />
    </div>
  )
}
