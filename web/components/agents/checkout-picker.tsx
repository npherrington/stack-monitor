import type { RepoCheckouts } from '../../../core/types.ts'
import { Field, FieldLabel } from '@/components/ui/field.tsx'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select.tsx'

function folder(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? path
}

// Which worktree of the repo a run goes in; primary first, as git lists them.
export function CheckoutPicker({
  repo,
  value,
  onChange,
}: {
  repo: RepoCheckouts | undefined
  value: string | null
  onChange: (checkout: string) => void
}) {
  if (repo === undefined || repo.checkouts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No checkouts to run in.</p>
    )
  }
  const items = repo.checkouts.map((checkout) => ({
    value: checkout.path,
    label: checkout.primary
      ? `${folder(checkout.path)} (primary)`
      : folder(checkout.path),
    branch: checkout.branch,
  }))
  return (
    <Field className="w-72 max-w-full">
      <FieldLabel htmlFor="run-in">Run in</FieldLabel>
      <Select
        items={items}
        value={value ?? repo.checkouts[0].path}
        onValueChange={(next) => {
          if (next !== null) onChange(next)
        }}
      >
        <SelectTrigger id="run-in" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              <span className="flex min-w-0 flex-col">
                <span className="truncate">{item.label}</span>
                <span className="truncate font-mono text-muted-foreground">
                  {item.branch ?? 'detached'}
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}
