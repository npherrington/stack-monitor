import type { RepoCheckouts } from '../../../core/types.ts'
import { Segmented } from '@/components/stack/segmented.tsx'

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
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm font-semibold text-strong">Run in</p>
      <Segmented
        label="Run in"
        options={repo.checkouts.map((checkout) => ({
          value: checkout.path,
          label: checkout.primary
            ? `${folder(checkout.path)} (primary)`
            : folder(checkout.path),
        }))}
        value={value ?? repo.checkouts[0].path}
        onChange={onChange}
      />
    </div>
  )
}
