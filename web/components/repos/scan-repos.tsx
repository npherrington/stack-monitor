import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'

import { Button } from '@/components/ui/button.tsx'
import { Checkbox } from '@/components/ui/checkbox.tsx'
import { Field, FieldError, FieldLabel } from '@/components/ui/field.tsx'
import { Input } from '@/components/ui/input.tsx'
import { Pill } from '@/components/ui/pill.tsx'
import { toast } from '@/components/ui/toast-manager.ts'
import { useRepoScan } from '@/hooks/use-repo-scan.ts'
import { useRepos } from '@/hooks/use-repos.ts'

const scanFormSchema = z.object({
  folder: z.string().trim().min(1, 'Name a folder to look in'),
})

type ScanFormValues = z.infer<typeof scanFormSchema>

export function ScanRepos() {
  const [folder, setFolder] = useState<string | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [adding, setAdding] = useState(false)
  const { result, isScanning, error } = useRepoScan(folder)
  const { addRepo } = useRepos()
  const form = useForm<ScanFormValues>({
    resolver: zodResolver(scanFormSchema),
    defaultValues: { folder: '~/code' },
  })

  const untracked = result?.hits.filter((hit) => !hit.tracked) ?? []

  const toggle = (root: string, on: boolean) =>
    setPicked((current) => {
      const next = new Set(current)
      if (on) next.add(root)
      else next.delete(root)
      return next
    })

  // One add per repo, then one toast for the lot.
  const addPicked = async () => {
    setAdding(true)
    const failed: string[] = []
    for (const root of picked) {
      try {
        await addRepo({ path: root })
      } catch {
        failed.push(root)
      }
    }
    setAdding(false)
    setPicked(new Set(failed))
    toast.add(
      failed.length === 0
        ? { title: `Added ${picked.size} repos`, type: 'success' }
        : {
            title: `Couldn't add ${failed.length} of ${picked.size}`,
            description: failed.join(', '),
            type: 'error',
          },
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <form
        noValidate
        onSubmit={form.handleSubmit(({ folder: next }) => {
          setPicked(new Set())
          setFolder(next)
        })}
        className="flex flex-col gap-3 sm:flex-row sm:items-start"
      >
        <Controller
          control={form.control}
          name="folder"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid} className="flex-1">
              <FieldLabel htmlFor={field.name}>Folder to look in</FieldLabel>
              <Input
                {...field}
                id={field.name}
                autoComplete="off"
                spellCheck={false}
                aria-invalid={fieldState.invalid}
                className="font-mono"
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Button
          type="submit"
          variant="outline"
          disabled={isScanning}
          className="sm:mt-6"
        >
          {isScanning ? 'Looking…' : 'Find repos'}
        </Button>
      </form>
      {error !== null && (
        <p className="text-sm text-destructive" role="alert">
          {error.message}
        </p>
      )}
      {result !== null && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            {result.hits.length === 0
              ? `No git repos in ${result.folder}.`
              : `${result.hits.length} in ${result.folder}${result.truncated ? ', stopped before looking everywhere' : ''}.`}
          </p>
          {result.hits.length > 0 && (
            <ul className="flex flex-col divide-y rounded-xl border bg-card">
              {result.hits.map((hit) => (
                <li
                  key={hit.root}
                  className="flex items-center gap-3 px-4 py-2.5"
                >
                  <Checkbox
                    id={`scan-${hit.root}`}
                    checked={hit.tracked || picked.has(hit.root)}
                    disabled={hit.tracked}
                    onCheckedChange={(on) => toggle(hit.root, on)}
                  />
                  <label
                    htmlFor={`scan-${hit.root}`}
                    className="flex min-w-0 flex-1 flex-col"
                  >
                    <span className="font-semibold text-strong">
                      {hit.name}
                    </span>
                    <span className="truncate font-mono text-xs text-muted-foreground">
                      {hit.root}
                    </span>
                  </label>
                  <Pill>
                    {hit.worktrees}{' '}
                    {hit.worktrees === 1 ? 'checkout' : 'checkouts'}
                  </Pill>
                  {hit.tracked && <Pill tone="good">tracked</Pill>}
                </li>
              ))}
            </ul>
          )}
          {untracked.length > 0 && (
            <Button
              className="self-start"
              disabled={picked.size === 0 || adding}
              onClick={addPicked}
            >
              {adding
                ? 'Adding…'
                : `Add ${picked.size || ''} selected`.replace('  ', ' ')}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
