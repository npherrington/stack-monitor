import { ListFilter, Search } from 'lucide-react'

import type { RepoCheckouts } from '../../../core/types.ts'
import { Button } from '@/components/ui/button.tsx'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.tsx'
import { Input } from '@/components/ui/input.tsx'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select.tsx'
import type { CheckoutFilters as Filters } from '@/lib/checkout-prefs.ts'

interface CheckoutFiltersProps {
  repos: RepoCheckouts[]
  filters: Filters
  onChange: (filters: Filters) => void
  query: string
  onQueryChange: (query: string) => void
}

const TOGGLES = [
  ['hidePrimary', 'Hide primary'],
  ['hideMerged', 'Hide merged'],
  ['hideClean', 'Hide clean'],
] as const

const ALL = 'all'

export function CheckoutFilters({
  repos,
  filters,
  onChange,
  query,
  onQueryChange,
}: CheckoutFiltersProps) {
  const on = TOGGLES.filter(([key]) => filters[key]).length
  const repoItems = [
    { value: ALL, label: 'All repos' },
    ...repos.map((repo) => ({ value: repo.root, label: repo.name })),
  ]
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-64">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          aria-label="Search worktrees"
          placeholder="Search name or branch"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          className="pl-8"
        />
      </div>
      {repos.length > 1 && (
        <Select
          items={repoItems}
          value={filters.repo ?? ALL}
          onValueChange={(value) =>
            onChange({ ...filters, repo: value === ALL ? null : value })
          }
        >
          <SelectTrigger aria-label="Repo" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {repoItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="outline" aria-label="Filter" />}
        >
          <ListFilter aria-hidden="true" />
          Filter
          {on > 0 && (
            <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground tabular-nums">
              {on}
            </span>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44">
          {TOGGLES.map(([key, label]) => (
            <DropdownMenuCheckboxItem
              key={key}
              checked={filters[key]}
              onCheckedChange={(checked) =>
                onChange({ ...filters, [key]: checked })
              }
            >
              {label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
