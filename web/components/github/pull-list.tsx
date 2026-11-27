import { useState } from 'react'
import { Link } from 'react-router'

import type { PullList as List, ReviewDecision } from '../../../core/types.ts'
import { Segmented } from '@/components/stack/segmented.tsx'
import { Card } from '@/components/ui/card.tsx'
import { Input } from '@/components/ui/input.tsx'
import { Pill } from '@/components/ui/pill.tsx'
import { pullPath } from '@/lib/github-links.ts'

type Scope = 'all' | 'mine' | 'others'

const DECISION: Record<
  Exclude<ReviewDecision, null>,
  { label: string; tone: 'good' | 'problem' | 'neutral' }
> = {
  APPROVED: { label: 'Approved', tone: 'good' },
  CHANGES_REQUESTED: { label: 'Changes requested', tone: 'problem' },
  REVIEW_REQUIRED: { label: 'Review required', tone: 'neutral' },
}

interface PullListProps {
  root: string
  list: List
}

export function PullList({ root, list }: PullListProps) {
  const [search, setSearch] = useState('')
  const [scope, setScope] = useState<Scope>('all')
  const needle = search.trim().toLowerCase()
  const pulls = list.pulls.filter(
    (pull) =>
      (scope === 'all' ||
        (scope === 'mine') === (pull.author === list.viewer)) &&
      (needle === '' ||
        `#${pull.number} ${pull.title} ${pull.author} ${pull.branch}`
          .toLowerCase()
          .includes(needle)),
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          type="search"
          aria-label="Filter PRs"
          placeholder="Filter by title, author, branch or #"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="max-w-sm"
        />
        <Segmented
          label="Whose"
          options={[
            { value: 'all', label: 'All' },
            { value: 'mine', label: 'Mine' },
            { value: 'others', label: "Others'" },
          ]}
          value={scope}
          onChange={setScope}
        />
      </div>
      {list.pulls.length === 0 ? (
        <p className="text-muted-foreground">No open PRs in {list.repo}.</p>
      ) : pulls.length === 0 ? (
        <p className="text-muted-foreground">No open PR matches.</p>
      ) : (
        <Card className="gap-0 py-0">
          <ul className="divide-y">
            {pulls.map((pull) => (
              <li key={pull.number}>
                <Link
                  to={pullPath(root, pull.number)}
                  className="flex flex-col gap-1 px-4 py-3 outline-none hover:bg-muted/50 focus-visible:bg-muted/50"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-strong">
                      {pull.title}
                    </span>
                    {pull.draft && <Pill>Draft</Pill>}
                    {pull.labels.map((label) => (
                      <Pill key={label}>{label}</Pill>
                    ))}
                    {pull.reviewDecision !== null && (
                      <Pill tone={DECISION[pull.reviewDecision].tone}>
                        {DECISION[pull.reviewDecision].label}
                      </Pill>
                    )}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>#{pull.number}</span>
                    <span>{pull.author}</span>
                    <span className="font-mono">
                      {pull.branch} → {pull.base}
                    </span>
                    <span className="text-success tabular-nums">
                      +{pull.additions}
                    </span>
                    <span className="text-destructive tabular-nums">
                      −{pull.deletions}
                    </span>
                    <span>
                      updated {new Date(pull.updatedAt).toLocaleString()}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
