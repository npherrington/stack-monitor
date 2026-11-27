import { useState } from 'react'

import type { PullList as List } from '../../../core/types.ts'
import { PullRow } from '@/components/github/pull-row.tsx'
import { Segmented } from '@/components/stack/segmented.tsx'
import { Card } from '@/components/ui/card.tsx'
import { Input } from '@/components/ui/input.tsx'
import { usePullPrefs } from '@/hooks/use-pull-prefs.ts'
import { useRowDrag } from '@/hooks/use-row-drag.ts'
import { pullPath } from '@/lib/github-links.ts'
import { movePull, orderedPulls } from '@/lib/pull-order.ts'
import { pullPrefKey } from '@/lib/pull-prefs.ts'
import type { Place } from '@/lib/row-order.ts'

type Scope = 'all' | 'mine' | 'others'

interface PullListProps {
  root: string
  list: List
}

// A repo's open PRs: pinned ones first, then in the order their reader gave them, then GitHub's.
export function PullList({ root, list }: PullListProps) {
  const { prefs, updatePref, setRanks } = usePullPrefs()
  const [search, setSearch] = useState('')
  const [scope, setScope] = useState<Scope>('all')
  const needle = search.trim().toLowerCase()
  const keyOf = (number: number) => pullPrefKey(root, number)
  const pulls = orderedPulls(root, list.pulls, prefs).filter(
    (pull) =>
      (scope === 'all' ||
        (scope === 'mine') === (pull.author === list.viewer)) &&
      (needle === '' ||
        `#${pull.number} ${pull.title} ${pull.author} ${pull.branch}`
          .toLowerCase()
          .includes(needle)),
  )

  const ranksFor = (number: number, target: number, place: Place) =>
    movePull(root, list.pulls, prefs, number, target, place)
  // Up or down one row of what's showing; null where that isn't a move (the top, or across pinning).
  const moveBy = (index: number, step: number) => {
    const other = pulls[index + step]
    if (other === undefined) return null
    const ranks = ranksFor(
      pulls[index].number,
      other.number,
      step < 0 ? 'before' : 'after',
    )
    return ranks === null ? null : () => setRanks(ranks)
  }
  // The drag names rows by data-row, which holds the PR's number.
  const drag = useRowDrag({
    canMove: (number, target, place) =>
      ranksFor(Number(number), Number(target), place) !== null,
    onMove: (number, target, place) => {
      const ranks = ranksFor(Number(number), Number(target), place)
      if (ranks !== null) setRanks(ranks)
    },
  })

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
          <div className="relative" {...drag.handlers}>
            <ul className="divide-y">
              {pulls.map((pull, index) => (
                <PullRow
                  key={pull.number}
                  to={pullPath(root, pull.number)}
                  pull={pull}
                  pref={prefs[keyOf(pull.number)] ?? {}}
                  onChange={(change) => updatePref(keyOf(pull.number), change)}
                  onMoveUp={moveBy(index, -1)}
                  onMoveDown={moveBy(index, 1)}
                />
              ))}
            </ul>
            {drag.dropTop !== null && (
              <div
                aria-hidden="true"
                style={{ top: drag.dropTop - 1 }}
                className="pointer-events-none absolute inset-x-2 h-0.5 rounded-full bg-primary"
              />
            )}
          </div>
        </Card>
      )}
    </div>
  )
}
