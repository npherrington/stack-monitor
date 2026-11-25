import { Play } from 'lucide-react'

import type { ClaudeWorkflow } from '../../../core/types.ts'
import { Button } from '@/components/ui/button.tsx'
import { Pill } from '@/components/ui/pill.tsx'
import { Skeleton } from '@/components/ui/skeleton.tsx'
import { useWorkflows } from '@/hooks/use-workflows.ts'

interface WorkflowChoicesProps {
  root: string
  isStarting: boolean
  onRunSaved: (name: string) => void
  onRunClaude: (workflow: ClaudeWorkflow) => void
}

// The repo's workflows, as its primary checkout has them, each with a Run button.
export function WorkflowChoices({
  root,
  isStarting,
  onRunSaved,
  onRunClaude,
}: WorkflowChoicesProps) {
  const { list, isPending, error } = useWorkflows(root)
  if (isPending) return <Skeleton className="h-32" />
  if (error !== null) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {error.message}
      </p>
    )
  }
  if (list === null || list.workflows.length + list.claude.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        This repo has no workflows yet. The Agents page builds them.
      </p>
    )
  }
  return (
    <ul className="flex max-h-[50dvh] flex-col gap-2 overflow-y-auto">
      {list.claude.map((workflow) => (
        <Choice
          key={`claude:${workflow.name}`}
          title={workflow.label}
          description={workflow.description}
          pill={workflow.launcher ? 'launcher' : 'script'}
          note={workflow.cost}
          action="Run…"
          disabled={false}
          onRun={() => onRunClaude(workflow)}
        />
      ))}
      {list.workflows.map((workflow) => (
        <Choice
          key={`saved:${workflow.name}`}
          title={workflow.name}
          description={workflow.description}
          pill={`${workflow.steps.length} steps · ${workflow.permissions}`}
          note={null}
          action="Run"
          disabled={isStarting}
          onRun={() => onRunSaved(workflow.name)}
        />
      ))}
    </ul>
  )
}

function Choice({
  title,
  description,
  pill,
  note,
  action,
  disabled,
  onRun,
}: {
  title: string
  description: string
  pill: string
  note: string | null
  action: string
  disabled: boolean
  onRun: () => void
}) {
  return (
    <li className="flex items-start gap-3 rounded-2xl border bg-card p-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-bold text-strong">{title}</p>
          <Pill>{pill}</Pill>
        </div>
        {description !== '' && (
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {description}
          </p>
        )}
        {note !== null && <p className="text-xs text-warning">{note}</p>}
      </div>
      <Button size="sm" onClick={onRun} disabled={disabled}>
        <Play />
        {action}
      </Button>
    </li>
  )
}
