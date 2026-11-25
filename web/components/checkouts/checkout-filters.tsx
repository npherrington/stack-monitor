import type { RepoCheckouts } from '../../../core/types.ts'
import type { CheckoutFilters as Filters } from '@/lib/checkout-prefs.ts'
import { cn } from '@/lib/utils.ts'

interface CheckoutFiltersProps {
  repos: RepoCheckouts[]
  filters: Filters
  onChange: (filters: Filters) => void
}

const TOGGLES = [
  ['hidePrimary', 'Hide primary'],
  ['hideMerged', 'Hide merged'],
  ['hideClean', 'Hide clean'],
] as const

function chipClass(on: boolean): string {
  return cn(
    'h-8 rounded-full border px-3.5 text-sm font-semibold transition outline-none focus-visible:ring-2 focus-visible:ring-ring',
    on
      ? 'border-transparent bg-primary text-primary-foreground shadow-sm'
      : 'bg-card text-muted-foreground hover:text-strong',
  )
}

export function CheckoutFilters({
  repos,
  filters,
  onChange,
}: CheckoutFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {repos.length > 1 && (
        <div role="group" aria-label="Repo" className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={filters.repo === null}
            className={chipClass(filters.repo === null)}
            onClick={() => onChange({ ...filters, repo: null })}
          >
            All
          </button>
          {repos.map((repo) => (
            <button
              key={repo.root}
              type="button"
              aria-pressed={filters.repo === repo.root}
              className={chipClass(filters.repo === repo.root)}
              onClick={() => onChange({ ...filters, repo: repo.root })}
            >
              {repo.name}
            </button>
          ))}
        </div>
      )}
      <div role="group" aria-label="Hide" className="flex flex-wrap gap-2">
        {TOGGLES.map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={filters[key]}
            className={chipClass(filters[key])}
            onClick={() => onChange({ ...filters, [key]: !filters[key] })}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
