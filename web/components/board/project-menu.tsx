import {
  Archive,
  ArchiveRestore,
  Ellipsis,
  Pencil,
  Tags,
  Trash2,
} from 'lucide-react'

import type { BoardProject } from '../../../core/types.ts'
import { Button } from '@/components/ui/button.tsx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.tsx'
import type { NoArgCallback } from '@/lib/callbacks.ts'

interface ProjectMenuProps {
  project: BoardProject
  onEdit: NoArgCallback
  onLabels: NoArgCallback
  onArchivedTickets: NoArgCallback
  onArchive: NoArgCallback
  onDelete: NoArgCallback // asks first
}

export function ProjectMenu({
  project,
  onEdit,
  onLabels,
  onArchivedTickets,
  onArchive,
  onDelete,
}: ProjectMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="icon"
            aria-label={`Actions for ${project.name}`}
          />
        }
      >
        <Ellipsis aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52 p-1">
        <DropdownMenuItem onClick={() => onEdit()}>
          <Pencil />
          Edit project…
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onLabels()}>
          <Tags />
          Labels…
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onArchivedTickets()}>
          <ArchiveRestore />
          Archived tickets ({project.archivedTickets})…
        </DropdownMenuItem>
        <DropdownMenuSeparator className="my-1" />
        <DropdownMenuItem onClick={() => onArchive()}>
          <Archive />
          Archive project
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={() => onDelete()}>
          <Trash2 />
          Delete project…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
