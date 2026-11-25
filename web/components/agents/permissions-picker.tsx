import type { RunPermissions } from '../../../core/types.ts'
import { Segmented } from '@/components/stack/segmented.tsx'

const OPTIONS: { value: RunPermissions; label: string }[] = [
  { value: 'read', label: 'Read only' },
  { value: 'edit', label: 'Edit files' },
  { value: 'full', label: 'Anything, no asking' },
]

const WORDS: Record<RunPermissions, string> = {
  read: 'Looks and answers; changes nothing.',
  edit: 'Edits files in the checkout; asks for nothing else.',
  full: 'Edits files and runs commands without asking. Use it in a worktree you can throw away.',
}

export function PermissionsPicker({
  value,
  onChange,
}: {
  value: RunPermissions
  onChange: (value: RunPermissions) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Segmented
        label="Permissions"
        options={OPTIONS}
        value={value}
        onChange={onChange}
      />
      <p className="text-xs text-muted-foreground">{WORDS[value]}</p>
    </div>
  )
}
