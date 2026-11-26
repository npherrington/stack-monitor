import {
  ArrowDown,
  ArrowUp,
  Check,
  CircleHelp,
  FilePen,
  GitMerge,
  type LucideIcon,
} from 'lucide-react'

import type { Checkout } from '../../../core/types.ts'
import { Tip } from '@/components/ui/tooltip.tsx'
import { cn } from '@/lib/utils.ts'

interface GitSummaryProps {
  checkout: Checkout
  mainline: string
}

interface Fact {
  key: string
  icon: LucideIcon
  count?: number
  tone: string
  label: string
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

// A checkout's git state as a few icons, each with what it means on hover: uncommitted files,
// commits ahead of and behind mainline, merged. One that has none of them shows a single tick.
export function GitSummary({ checkout, mainline }: GitSummaryProps) {
  const { changed, ahead, behind, merged } = checkout
  const facts: Fact[] = []
  if (changed > 0) {
    facts.push({
      key: 'changed',
      icon: FilePen,
      count: changed,
      tone: 'text-warning',
      label: `${plural(changed, 'uncommitted file', 'uncommitted files')}`,
    })
  }
  if (ahead !== null && ahead > 0) {
    facts.push({
      key: 'ahead',
      icon: ArrowUp,
      count: ahead,
      tone: 'text-strong',
      label: `${plural(ahead, 'commit', 'commits')} not on ${mainline} yet`,
    })
  }
  if (behind !== null && behind > 0) {
    facts.push({
      key: 'behind',
      icon: ArrowDown,
      count: behind,
      tone: 'text-muted-foreground',
      label: `${plural(behind, 'commit', 'commits')} behind ${mainline}`,
    })
  }
  if (merged) {
    facts.push({
      key: 'merged',
      icon: GitMerge,
      tone: 'text-success',
      label: `Merged into ${mainline}`,
    })
  }
  if (ahead === null) {
    facts.push({
      key: 'mainline',
      icon: CircleHelp,
      tone: 'text-muted-foreground',
      label: `${mainline} isn't in this repo, so there's nothing to compare with`,
    })
  }
  if (facts.length === 0) {
    facts.push({
      key: 'clean',
      icon: Check,
      tone: 'text-success',
      label: `Nothing uncommitted, up to date with ${mainline}`,
    })
  }
  return (
    <ul className="flex items-center gap-3 text-xs font-medium tabular-nums">
      {facts.map(({ key, icon: Icon, count, tone, label }) => (
        <li key={key}>
          <Tip label={label}>
            <span className={cn('inline-flex items-center gap-1', tone)}>
              <Icon className="size-3.5" aria-hidden="true" />
              {count !== undefined && <span aria-hidden="true">{count}</span>}
              <span className="sr-only">{label}</span>
            </span>
          </Tip>
        </li>
      ))}
    </ul>
  )
}
