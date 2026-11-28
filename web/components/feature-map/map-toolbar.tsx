import { ChevronDown, Ellipsis, Pencil, Plus, Save, Trash2 } from 'lucide-react'

import type {
  StackMap,
  StackMapStarter,
  StackMapSummary,
} from '../../../core/types.ts'
import { RepoSelect } from '@/components/ui/repo-select.tsx'
import { MapPicker } from '@/components/feature-map/map-picker.tsx'
import { Button } from '@/components/ui/button.tsx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.tsx'
import type { NoArgCallback } from '@/lib/callbacks.ts'
import { blankMap, starterCopy } from '@/lib/stack-map-canvas.ts'

interface MapToolbarProps {
  repos: { root: string; name: string }[]
  root: string
  maps: StackMapSummary[]
  starters: StackMapStarter[]
  name: string | null // the saved map open; null: an unsaved one
  isDirty: boolean
  isSaving: boolean
  onPickRepo: (root: string) => void
  onPickMap: (name: string) => void
  onNew: (map: StackMap) => void
  onSave: NoArgCallback // a saved map saves at once; an unsaved one asks for a title and file name
  onDetails: NoArgCallback
  onDelete: NoArgCallback // asks first
}

export function MapToolbar({
  repos,
  root,
  maps,
  starters,
  name,
  isDirty,
  isSaving,
  onPickRepo,
  onPickMap,
  onNew,
  onSave,
  onDetails,
  onDelete,
}: MapToolbarProps) {
  const builtIn = starters.filter((starter) => starter.source === 'built-in')
  const own = starters.filter((starter) => starter.source === 'repo')
  return (
    <div className="flex flex-wrap items-end gap-2">
      {repos.length > 1 && (
        <div className="w-48">
          <RepoSelect
            id="stack-map-repo"
            repos={repos}
            value={root}
            onChange={onPickRepo}
          />
        </div>
      )}
      <MapPicker maps={maps} value={name} onChange={onPickMap} />
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" />}>
          <Plus aria-hidden="true" />
          New
          <ChevronDown aria-hidden="true" className="text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56 p-1">
          <DropdownMenuItem onClick={() => onNew(blankMap())}>
            Blank map
          </DropdownMenuItem>
          <StarterItems label="Starters" starters={builtIn} onNew={onNew} />
          <StarterItems label="From this repo" starters={own} onNew={onNew} />
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        onClick={() => onSave()}
        disabled={isSaving || (name !== null && !isDirty)}
      >
        <Save aria-hidden="true" />
        {isSaving ? 'Saving…' : 'Save'}
      </Button>
      {isDirty && (
        <span
          className="flex h-8 items-center text-xs text-muted-foreground"
          role="status"
        >
          Unsaved changes
        </span>
      )}
      {name !== null && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                size="icon"
                aria-label="Actions for this map"
                className="ml-auto"
              />
            }
          >
            <Ellipsis aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44 p-1">
            <DropdownMenuItem onClick={() => onDetails()}>
              <Pencil />
              Details…
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => onDelete()}>
              <Trash2 />
              Delete…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}

interface StarterItemsProps {
  label: string
  starters: StackMapStarter[]
  onNew: (map: StackMap) => void
}

function StarterItems({ label, starters, onNew }: StarterItemsProps) {
  if (starters.length === 0) return null
  return (
    <>
      <DropdownMenuSeparator className="my-1" />
      <DropdownMenuGroup>
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        {starters.map((starter) => (
          <DropdownMenuItem
            key={`${starter.source}:${starter.name}`}
            onClick={() => onNew(starterCopy(starter))}
          >
            {starter.map.title}
          </DropdownMenuItem>
        ))}
      </DropdownMenuGroup>
    </>
  )
}
