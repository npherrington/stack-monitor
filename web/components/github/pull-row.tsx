import {
  ArrowDown,
  ArrowUp,
  Ellipsis,
  GripVertical,
  Pin,
  PinOff,
} from 'lucide-react'
import { Link } from 'react-router'

import type { ListedPull, ReviewDecision } from '../../../core/types.ts'
import { ChecksPill } from '@/components/github/checks-pill.tsx'
import { LabelPill } from '@/components/github/label-pill.tsx'
import { Button } from '@/components/ui/button.tsx'
import { ColourMenu } from '@/components/ui/colour-menu.tsx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.tsx'
import { Pill } from '@/components/ui/pill.tsx'
import { swatchTint } from '@/components/ui/swatch-variants.ts'
import { Tip } from '@/components/ui/tooltip.tsx'
import type { PullPref } from '@/lib/pull-prefs.ts'
import { cn } from '@/lib/utils.ts'

const DECISION: Record<
  Exclude<ReviewDecision, null>,
  { label: string; tone: 'good' | 'problem' | 'neutral' }
> = {
  APPROVED: { label: 'Approved', tone: 'good' },
  CHANGES_REQUESTED: { label: 'Changes requested', tone: 'problem' },
  REVIEW_REQUIRED: { label: 'Review required', tone: 'neutral' },
}

interface PullRowProps {
  to: string // the PR's page here
  pull: ListedPull
  pref: PullPref
  onChange: (change: Partial<PullPref>) => void
  onMoveUp: (() => void) | null // null at the top of its group
  onMoveDown: (() => void) | null
}

// One open PR in a repo's list: a link to its page, with the pin, colour and place its reader
// gave it.
export function PullRow({
  to,
  pull,
  pref,
  onChange,
  onMoveUp,
  onMoveDown,
}: PullRowProps) {
  const togglePin = () => onChange({ pinned: pref.pinned ? undefined : true })

  return (
    <li
      data-row={pull.number}
      className={cn(
        'group relative flex items-center gap-2 pr-3 transition-colors',
        swatchTint({ colour: pref.colour ?? 'none' }),
      )}
    >
      {/* Dragged by PullList, which listens on the list (useRowDrag reads data-row). The menu's
          Move items do the same from the keyboard. */}
      <span
        draggable
        aria-hidden="true"
        title="Drag to reorder"
        className="absolute inset-y-0 left-0 flex w-4 cursor-grab items-center justify-center text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
      >
        <GripVertical className="size-3.5" />
      </span>
      <Link
        to={to}
        draggable={false}
        className="flex min-w-0 flex-1 flex-col gap-1 py-3 pl-4 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-strong">
            {pull.title}
          </span>
          {pref.pinned && (
            <Tip label="Pinned to the top">
              <span className="inline-flex shrink-0 items-center">
                <Pin
                  className="size-3.5 fill-current text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="sr-only">Pinned to the top</span>
              </span>
            </Tip>
          )}
          {pull.draft && <Pill>Draft</Pill>}
          {pull.labels.map((label) => (
            <LabelPill key={label.name} label={label} />
          ))}
          {pull.reviewDecision !== null && (
            <Pill tone={DECISION[pull.reviewDecision].tone}>
              {DECISION[pull.reviewDecision].label}
            </Pill>
          )}
          <ChecksPill summary={pull.checks} />
        </span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>#{pull.number}</span>
          <span>{pull.author}</span>
          <span className="font-mono">
            {pull.branch} → {pull.base}
          </span>
          <span className="text-success tabular-nums">+{pull.additions}</span>
          <span className="text-destructive tabular-nums">
            −{pull.deletions}
          </span>
          <span>updated {new Date(pull.updatedAt).toLocaleString()}</span>
        </span>
      </Link>
      <div className="flex shrink-0 items-center gap-1">
        <Tip label={pref.pinned ? 'Unpin' : 'Pin to the top'}>
          <Button
            variant="quiet"
            size="icon-sm"
            aria-label={
              pref.pinned ? `Unpin #${pull.number}` : `Pin #${pull.number}`
            }
            aria-pressed={pref.pinned === true}
            onClick={togglePin}
            className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          >
            {pref.pinned ? <PinOff /> : <Pin />}
          </Button>
        </Tip>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="quiet"
                size="icon-sm"
                aria-label={`More for #${pull.number}`}
              />
            }
          >
            <Ellipsis />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={togglePin}>
              {pref.pinned ? <PinOff /> : <Pin />}
              {pref.pinned ? 'Unpin' : 'Pin to top'}
            </DropdownMenuItem>
            <ColourMenu
              colour={pref.colour}
              onPick={(colour) => onChange({ colour })}
            />
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={onMoveUp === null}
              onClick={() => onMoveUp?.()}
            >
              <ArrowUp />
              Move up
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={onMoveDown === null}
              onClick={() => onMoveDown?.()}
            >
              <ArrowDown />
              Move down
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  )
}
