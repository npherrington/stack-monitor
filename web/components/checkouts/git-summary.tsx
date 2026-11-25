import { ArrowDown, ArrowUp, FilePen, GitMerge } from 'lucide-react'

import type { Checkout } from '../../../core/types.ts'
import { Pill } from '@/components/ui/pill.tsx'

interface GitSummaryProps {
  checkout: Checkout
  mainline: string
}

// Changed files, commits ahead of and behind mainline, and merged, each only when it has something
// to say. A checkout with none of them reads "clean".
export function GitSummary({ checkout, mainline }: GitSummaryProps) {
  const { changed, ahead, behind, merged } = checkout
  const facts = []
  if (changed > 0) {
    facts.push(
      <Pill key="changed" tone="attention">
        <FilePen aria-hidden="true" />
        {changed} changed
      </Pill>,
    )
  }
  if (ahead !== null && ahead > 0) {
    facts.push(
      <Pill key="ahead" tone="highlight" title={`Commits not on ${mainline}`}>
        <ArrowUp aria-hidden="true" />
        {ahead} ahead
      </Pill>,
    )
  }
  if (behind !== null && behind > 0) {
    facts.push(
      <Pill key="behind" title={`Commits on ${mainline} it doesn't have`}>
        <ArrowDown aria-hidden="true" />
        {behind} behind
      </Pill>,
    )
  }
  if (merged) {
    facts.push(
      <Pill key="merged" tone="good">
        <GitMerge aria-hidden="true" />
        merged
      </Pill>,
    )
  }
  if (ahead === null) {
    facts.push(
      <Pill key="mainline" title={`${mainline} doesn't resolve in this repo`}>
        no {mainline}
      </Pill>,
    )
  }
  if (facts.length === 0) facts.push(<Pill key="clean">clean</Pill>)
  return <div className="flex flex-wrap gap-1.5">{facts}</div>
}
