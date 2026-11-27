import { ChevronDown, FolderArchive, Plus } from 'lucide-react'

import type { BoardProject } from '../../../core/types.ts'
import { ColourDot } from '@/components/board/colour-dot.tsx'
import { Button } from '@/components/ui/button.tsx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.tsx'
import type { NoArgCallback } from '@/lib/callbacks.ts'

interface ProjectPickerProps {
  projects: BoardProject[] // the unarchived ones
  current: BoardProject | null
  archived: number // how many archived projects there are
  onPick: (id: number) => void
  onNew: NoArgCallback
  onShowArchived: NoArgCallback
}

// The project whose board is showing, and the way to another, a new one or the archived ones.
export function ProjectPicker({
  projects,
  current,
  archived,
  onPick,
  onNew,
  onShowArchived,
}: ProjectPickerProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" />}>
        <span className="sr-only">Project: </span>
        {current !== null && <ColourDot colour={current.colour} />}
        <span className="max-w-48 truncate">
          {current?.name ?? 'Choose a project'}
        </span>
        <ChevronDown aria-hidden="true" className="text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 p-1">
        {projects.length > 0 && (
          <>
            <DropdownMenuRadioGroup
              value={current === null ? '' : String(current.id)}
              onValueChange={(value: string) => onPick(Number(value))}
            >
              {projects.map((project) => (
                <DropdownMenuRadioItem
                  key={project.id}
                  value={String(project.id)}
                  closeOnClick
                >
                  <ColourDot colour={project.colour} />
                  <span className="min-w-0 flex-1 truncate">
                    {project.name}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {project.prefix}
                  </span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator className="my-1" />
          </>
        )}
        <DropdownMenuItem onClick={() => onNew()}>
          <Plus />
          New project…
        </DropdownMenuItem>
        {archived > 0 && (
          <DropdownMenuItem onClick={() => onShowArchived()}>
            <FolderArchive />
            Archived projects ({archived})…
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
