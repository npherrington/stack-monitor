import { useState } from 'react'

import type {
  AgentChoice,
  AgentsOverview,
  ClaudeWorkflow,
  RunPermissions,
} from '../../../core/types.ts'
import { AgentPicker } from '@/components/agents/agent-picker.tsx'
import { PermissionsPicker } from '@/components/agents/permissions-picker.tsx'
import { WorkflowChoices } from '@/components/checkouts/workflow-choices.tsx'
import { Segmented } from '@/components/stack/segmented.tsx'
import { Button } from '@/components/ui/button.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.tsx'
import { Textarea } from '@/components/ui/textarea.tsx'
import { useStartRun, useStartTask } from '@/hooks/use-runs.ts'

export interface RunHereTarget {
  root: string
  checkout: string
}

interface RunHereDialogProps {
  target: RunHereTarget | null // open while set
  overview: AgentsOverview | null
  onClose: () => void
  onStarted: (runId: string) => void
  onRunClaude: (workflow: ClaudeWorkflow) => void
}

type Mode = 'prompt' | 'workflow'

const MODES: { value: Mode; label: string }[] = [
  { value: 'prompt', label: 'Prompt' },
  { value: 'workflow', label: 'Workflow' },
]

// Starts a headless agent in one checkout with a prompt, or one of the repo's workflows. Runs
// spend money, so they only start from the page, never from the MCP server.
export function RunHereDialog({
  target,
  overview,
  onClose,
  onStarted,
  onRunClaude,
}: RunHereDialogProps) {
  const checkout = target?.checkout ?? null
  const { startTask, isStarting: isStartingTask } = useStartTask()
  const { start, isStarting: isStartingWorkflow } = useStartRun()
  const isStarting = isStartingTask || isStartingWorkflow
  const [mode, setMode] = useState<Mode>('prompt')
  const [prompt, setPrompt] = useState('')
  const [permissions, setPermissions] = useState<RunPermissions>('edit')
  const [choice, setChoice] = useState<AgentChoice | null>(null)
  const fallback: AgentChoice | null =
    overview?.default === null || overview === null
      ? null
      : {
          agent: overview.default,
          model:
            overview.agents.find((agent) => agent.id === overview.default)
              ?.model ?? null,
        }
  const agent = choice ?? fallback

  const submit = async () => {
    if (checkout === null || agent === null || prompt.trim() === '') return
    try {
      const runId = await startTask({
        checkout,
        permissions,
        title: prompt.trim().split('\n')[0].slice(0, 80),
        steps: [{ ...agent, prompt: prompt.trim() }],
      })
      setPrompt('')
      onStarted(runId)
    } catch {
      // useStartTask's toast says why; the form stays as it was.
    }
  }

  const runSaved = async (name: string) => {
    if (checkout === null) return
    try {
      onStarted(await start('/api/workflows/run', { checkout, name }))
    } catch {
      // The start's toast says why.
    }
  }

  return (
    <Dialog
      open={checkout !== null}
      onOpenChange={(open) => !open && onClose()}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Run an agent here</DialogTitle>
          <DialogDescription className="truncate font-mono text-xs">
            {checkout}
          </DialogDescription>
        </DialogHeader>
        <Segmented
          label="Run"
          options={MODES}
          value={mode}
          onChange={setMode}
        />
        {mode === 'workflow' && target !== null ? (
          <WorkflowChoices
            root={target.root}
            isStarting={isStarting}
            onRunSaved={runSaved}
            onRunClaude={onRunClaude}
          />
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="run-prompt"
                className="text-sm font-semibold text-strong"
              >
                What should it do?
              </label>
              <Textarea
                id="run-prompt"
                rows={6}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Fix the failing test in tests/checkouts.test.ts and explain the cause."
              />
            </div>
            {overview !== null && agent !== null ? (
              <AgentPicker
                overview={overview}
                value={agent}
                onChange={setChoice}
              />
            ) : (
              <p className="text-sm text-destructive">
                No agent CLI is installed. Settings → Agents says how to add
                one.
              </p>
            )}
            <PermissionsPicker value={permissions} onChange={setPermissions} />
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {mode === 'prompt' && (
            <Button
              onClick={submit}
              disabled={isStarting || agent === null || prompt.trim() === ''}
            >
              {isStarting ? 'Starting…' : 'Start run'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
