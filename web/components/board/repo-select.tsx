import type { RepoCheckouts } from '../../../core/types.ts'
import { Field, FieldLabel } from '@/components/ui/field.tsx'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select.tsx'

interface RepoSelectProps {
  id: string
  repos: RepoCheckouts[]
  value: string // the picked repo's root
  onChange: (root: string) => void
}

// Which tracked repo a session started from the board runs in.
export function RepoSelect({ id, repos, value, onChange }: RepoSelectProps) {
  const items = repos.map((repo) => ({ value: repo.root, label: repo.name }))
  return (
    <Field>
      <FieldLabel htmlFor={id}>Repo</FieldLabel>
      <Select
        items={items}
        value={value}
        onValueChange={(next) => {
          if (next !== null) onChange(next)
        }}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}
