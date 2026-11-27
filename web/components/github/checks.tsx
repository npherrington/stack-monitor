import { ChevronDown, ChevronRight, ExternalLink, RotateCw } from 'lucide-react'
import { useState } from 'react'

import type { ActionsRun, CheckState, PullCheck } from '../../../core/types.ts'
import { CheckLog } from '@/components/github/check-log.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Card } from '@/components/ui/card.tsx'
import { Pill } from '@/components/ui/pill.tsx'
import { Skeleton } from '@/components/ui/skeleton.tsx'
import { useCheckMutations } from '@/hooks/use-check-mutations.ts'
import { usePullChecks } from '@/hooks/use-pull-checks.ts'

const STATE: Record<
  CheckState,
  { label: string; tone: 'good' | 'problem' | 'attention' | 'neutral' }
> = {
  pass: { label: 'Passed', tone: 'good' },
  fail: { label: 'Failed', tone: 'problem' },
  pending: { label: 'Running', tone: 'attention' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  skipped: { label: 'Skipped', tone: 'neutral' },
}

function duration(check: PullCheck): string {
  if (check.seconds === null) {
    if (check.state !== 'pending') return ''
    return check.startedAt === null ? 'waiting' : 'running'
  }
  const minutes = Math.floor(check.seconds / 60)
  const seconds = check.seconds % 60
  return minutes === 0 ? `${seconds}s` : `${minutes}m ${seconds}s`
}

interface CheckRowProps {
  root: string
  check: PullCheck
}

function CheckRow({ root, check }: CheckRowProps) {
  const [open, setOpen] = useState(false)
  const { label, tone } = STATE[check.state]
  const hasLog = check.state === 'fail' && check.job !== null

  return (
    <li className="flex flex-col gap-2 px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Pill tone={tone}>{label}</Pill>
        <span className="text-sm font-medium text-strong">{check.name}</span>
        {check.description !== null && (
          <span className="min-w-0 truncate text-xs text-muted-foreground">
            {check.description}
          </span>
        )}
        <span className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground tabular-nums">
            {duration(check)}
          </span>
          {hasLog && (
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={open}
              onClick={() => setOpen(!open)}
            >
              {open ? <ChevronDown /> : <ChevronRight />} Failed log
            </Button>
          )}
          {check.url !== null && (
            <a
              href={check.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-semibold underline"
            >
              Details <ExternalLink className="size-3" />
            </a>
          )}
        </span>
      </div>
      {open && check.job !== null && (
        <CheckLog root={root} job={check.job} url={check.url} />
      )}
    </li>
  )
}

interface RunHeaderProps {
  run: ActionsRun
  disabled: boolean
  onRerun: (run: number) => void
}

function RunHeader({ run, disabled, onRerun }: RunHeaderProps) {
  const name = `${run.workflow} #${run.number}`
  return (
    <>
      {run.url === null ? (
        <span className="text-sm font-semibold text-strong">{name}</span>
      ) : (
        <a
          href={run.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm font-semibold text-strong hover:underline"
        >
          {name}
          <ExternalLink className="size-3.5" />
        </a>
      )}
      <Pill tone={STATE[run.state].tone}>{STATE[run.state].label}</Pill>
      {run.rerunnable && (
        <Button
          variant="secondary"
          size="sm"
          className="ml-auto"
          disabled={disabled}
          onClick={() => onRerun(run.id)}
        >
          <RotateCw /> Re-run failed jobs
        </Button>
      )}
    </>
  )
}

interface ChecksProps {
  root: string
  number: number
}

// The CI checks on a PR's head commit: each Actions run with its jobs, then commit statuses and
// other apps' checks.
export function Checks({ root, number }: ChecksProps) {
  const { checks, isPending, error, isStale } = usePullChecks(root, number)
  const { rerunFailed, isRerunning, sentRun } = useCheckMutations(root, number)

  if (isPending) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-32" />
        <Skeleton className="h-24" />
      </div>
    )
  }
  if (checks === null) {
    return (
      <p className="whitespace-pre-wrap text-destructive" role="alert">
        {error?.message ?? `Couldn't read #${number}'s checks`}
      </p>
    )
  }
  if (checks.groups.length === 0) {
    return (
      <p className="text-muted-foreground">
        No checks reported on{' '}
        <span className="font-mono">{checks.sha.slice(0, 7)}</span>. They show
        here once CI or a status reports on the PR.
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      {isStale && (
        <p className="text-xs text-warning" role="status">
          Couldn't refresh; showing the last read
        </p>
      )}
      {checks.cut && (
        <p className="text-xs text-muted-foreground">
          GitHub has more than 100 checks on this commit; these are the first
          100, and the rest are on GitHub.
        </p>
      )}
      {checks.groups.map((group) => (
        <Card key={group.run?.id ?? 'other'} className="gap-0 py-0">
          <div className="flex flex-wrap items-center gap-3 border-b px-4 py-2.5">
            {group.run === null ? (
              <span className="text-sm font-semibold text-strong">
                Other checks
              </span>
            ) : (
              <RunHeader
                run={group.run}
                disabled={isRerunning || sentRun === group.run.id}
                onRerun={rerunFailed}
              />
            )}
          </div>
          <ul className="divide-y">
            {group.checks.map((check) => (
              <CheckRow
                key={check.job ?? `${check.name}\n${check.url ?? ''}`}
                root={root}
                check={check}
              />
            ))}
          </ul>
        </Card>
      ))}
    </div>
  )
}
