import { Pencil, Play, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'

import type {
  AgentsOverview,
  ClaudeWorkflow,
  RepoCheckouts,
  Workflow,
} from '../../../core/types.ts'
import { CheckoutPicker } from '@/components/agents/checkout-picker.tsx'
import { ClaudeWorkflowDialog } from '@/components/agents/claude-workflow-dialog.tsx'
import { WorkflowEditor } from '@/components/agents/workflow-editor.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Pill } from '@/components/ui/pill.tsx'
import { Skeleton } from '@/components/ui/skeleton.tsx'
import { useStartRun } from '@/hooks/use-runs.ts'
import { useWorkflows } from '@/hooks/use-workflows.ts'

interface WorkflowsPanelProps {
  root: string
  repo: RepoCheckouts | undefined
  overview: AgentsOverview | null
  onOpenRun: (id: string) => void
}

export function WorkflowsPanel({
  root,
  repo,
  overview,
  onOpenRun,
}: WorkflowsPanelProps) {
  const { list, isPending, error, deleteWorkflow } = useWorkflows(root)
  const { start, isStarting } = useStartRun()
  const [editing, setEditing] = useState<Workflow | 'new' | null>(null)
  const [checkout, setCheckout] = useState<string | null>(null)
  const [runningClaude, setRunningClaude] = useState<ClaudeWorkflow | null>(
    null,
  )
  const where = checkout ?? repo?.checkouts[0]?.path

  const run = async (name: string) => {
    if (where === undefined) return
    try {
      onOpenRun(await start('/api/workflows/run', { checkout: where, name }))
    } catch {
      // The start's toast says why.
    }
  }

  if (editing !== null) {
    return (
      <WorkflowEditor
        root={root}
        checkout={where}
        overview={overview}
        editing={editing === 'new' ? null : editing}
        onDone={() => setEditing(null)}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <CheckoutPicker repo={repo} value={checkout} onChange={setCheckout} />
        <Button onClick={() => setEditing('new')}>
          <Plus />
          New workflow
        </Button>
      </div>
      {isPending ? (
        <Skeleton className="h-40" />
      ) : error !== null ? (
        <p className="text-sm text-destructive" role="alert">
          {error.message}
        </p>
      ) : list === null ||
        (list.workflows.length === 0 && list.claude.length === 0) ? (
        <p className="text-muted-foreground">
          No workflows yet. A workflow is one to four agent steps, run in order
          in one checkout, saved as{' '}
          <code>.agents/workflows/&lt;name&gt;.json</code>. Claude Code
          workflows in <code>.claude/workflows/</code> show here too.
        </p>
      ) : list.workflows.length === 0 ? null : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {list.workflows.map((workflow) => (
            <li
              key={workflow.name}
              className="flex flex-col gap-2 rounded-2xl border bg-card p-4"
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-strong">{workflow.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {workflow.description}
                  </p>
                </div>
                <Pill>{workflow.permissions}</Pill>
              </div>
              <ol className="flex flex-wrap gap-1.5">
                {workflow.steps.map((step, at) => (
                  <li key={at}>
                    <Pill tone="highlight">
                      {at + 1}. {step.title} · {step.agent ?? 'default'}
                    </Pill>
                  </li>
                ))}
              </ol>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => run(workflow.name)}
                  disabled={isStarting}
                >
                  <Play />
                  Run
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditing(workflow)}
                >
                  <Pencil />
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => deleteWorkflow(workflow.name)}
                >
                  <Trash2 />
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {list !== null && list.claude.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-bold text-strong">
            Claude Code workflows{' '}
            <span className="font-mono text-xs font-normal text-muted-foreground">
              .claude/workflows
            </span>
          </h2>
          <ul className="grid gap-3 lg:grid-cols-2">
            {list.claude.map((workflow) => (
              <li
                key={workflow.name}
                className="flex flex-col gap-2 rounded-2xl border bg-card p-4"
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-strong">{workflow.label}</p>
                    <p className="text-sm text-muted-foreground">
                      {workflow.description}
                    </p>
                  </div>
                  <Pill>{workflow.launcher ? 'launcher' : 'script'}</Pill>
                </div>
                {workflow.phases.length > 0 && (
                  <ol className="flex flex-wrap gap-1.5">
                    {workflow.phases.map((phase, at) => (
                      <li key={at}>
                        <Pill tone="highlight">
                          {at + 1}. {phase}
                        </Pill>
                      </li>
                    ))}
                  </ol>
                )}
                {workflow.cost !== null && (
                  <p className="text-xs text-muted-foreground">
                    {workflow.cost}
                  </p>
                )}
                <div>
                  <Button
                    size="sm"
                    onClick={() => setRunningClaude(workflow)}
                    disabled={where === undefined}
                  >
                    <Play />
                    Run…
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {list !== null && list.problems.length > 0 && (
        <ul className="text-sm text-destructive">
          {list.problems.map((problem) => (
            <li key={problem.file}>
              <span className="font-mono">{problem.file}</span>:{' '}
              {problem.problem}
            </li>
          ))}
        </ul>
      )}
      <ClaudeWorkflowDialog
        workflow={runningClaude}
        checkout={where}
        onClose={() => setRunningClaude(null)}
        onStarted={(id) => {
          setRunningClaude(null)
          onOpenRun(id)
        }}
      />
    </div>
  )
}
