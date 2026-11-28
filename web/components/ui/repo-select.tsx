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
  repos: { root: string; name: string }[]
  value: string // the picked repo's root
  onChange: (root: string) => void
}

// A labelled picker over a list of repos, by root.
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
