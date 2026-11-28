import { Trash2 } from 'lucide-react'

import type { BlockInfo } from '../../../core/types.ts'
import { KIND_LABELS } from '@/components/feature-map/block-kinds.ts'
import { Button } from '@/components/ui/button.tsx'
import { Field, FieldLabel } from '@/components/ui/field.tsx'
import { Input } from '@/components/ui/input.tsx'
import { Textarea } from '@/components/ui/textarea.tsx'
import type { SelectedElement } from '@/hooks/use-stack-map-state.ts'

interface MapInspectorProps {
  selected: SelectedElement | null
  blocks: BlockInfo[] // to say where a selected block's code lives
  onNodeChange: (id: string, change: { label?: string; note?: string }) => void
  onEdgeLabel: (id: string, label: string) => void
  onRemove: (kind: 'node' | 'edge', id: string) => void
}

// The selected block's label and note, or the selected arrow's label. What's typed goes straight
// into the canvas: nothing here is submitted, so it isn't a form.
export function MapInspector({
  selected,
  blocks,
  onNodeChange,
  onEdgeLabel,
  onRemove,
}: MapInspectorProps) {
  if (selected === null) {
    return (
      <p className="text-sm text-muted-foreground">
        Select a block or an arrow to label it.
      </p>
    )
  }

  if (selected.kind === 'edge') {
    const { edge } = selected
    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-strong">Arrow</h2>
        <Field>
          <FieldLabel htmlFor="stack-map-arrow-label">Label</FieldLabel>
          <Input
            id="stack-map-arrow-label"
            autoComplete="off"
            maxLength={80}
            placeholder="calls"
            value={typeof edge.label === 'string' ? edge.label : ''}
            onChange={(event) => onEdgeLabel(edge.id, event.target.value)}
          />
        </Field>
        <Button
          variant="destructive"
          className="self-start"
          onClick={() => onRemove('edge', edge.id)}
        >
          <Trash2 aria-hidden="true" />
          Remove arrow
        </Button>
      </div>
    )
  }

  const { node } = selected
  const block = blocks.find((each) => each.id === node.data.block)
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-sm font-semibold text-strong">
          {node.data.blockName}
        </h2>
        {block !== undefined && (
          <p className="text-xs text-muted-foreground">
            {KIND_LABELS[block.kind]}
          </p>
        )}
      </div>
      <Field>
        <FieldLabel htmlFor="stack-map-node-label">Label</FieldLabel>
        <Input
          id="stack-map-node-label"
          autoComplete="off"
          maxLength={80}
          placeholder={node.data.blockName}
          value={node.data.label}
          onChange={(event) =>
            onNodeChange(node.id, { label: event.target.value })
          }
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="stack-map-node-note">Note</FieldLabel>
        <Textarea
          id="stack-map-node-note"
          rows={4}
          maxLength={1000}
          placeholder="What changes here"
          value={node.data.note}
          onChange={(event) =>
            onNodeChange(node.id, { note: event.target.value })
          }
        />
      </Field>
      {block !== undefined && <PathList heading="Code" paths={block.paths} />}
      {block !== undefined && (
        <PathList heading="Read first" paths={block.docs} />
      )}
      <Button
        variant="destructive"
        className="self-start"
        onClick={() => onRemove('node', node.id)}
      >
        <Trash2 aria-hidden="true" />
        Remove block
      </Button>
    </div>
  )
}

interface PathListProps {
  heading: string
  paths: string[]
}

function PathList({ heading, paths }: PathListProps) {
  if (paths.length === 0) return null
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-xs font-semibold text-muted-foreground">{heading}</h3>
      <ul className="flex flex-col gap-0.5">
        {paths.map((path) => (
          <li key={path} className="font-mono text-xs break-all">
            {path}
          </li>
        ))}
      </ul>
    </div>
  )
}
