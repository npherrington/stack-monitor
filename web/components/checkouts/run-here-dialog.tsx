import { useState } from 'react'

import type {
  AgentChoice,
  AgentsOverview,
  RunPermissions,
} from '../../../core/types.ts'
import { AgentPicker } from '@/components/agents/agent-picker.tsx'
import { PermissionsPicker } from '@/components/agents/permissions-picker.tsx'
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
import { useStartTask } from '@/hooks/use-runs.ts'

interface RunHereDialogProps {
  checkout: string | null // open while set
  overview: AgentsOverview | null
  onClose: () => void
  onStarted: (runId: string) => void
}

// Starts a headless agent in one checkout with a prompt. Runs spend money, so they only start
// from here, never from the MCP server.
export function RunHereDialog({
  checkout,
  overview,
  onClose,
  onStarted,
}: RunHereDialogProps) {
  const { startTask, isStarting } = useStartTask()
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
              No agent CLI is installed. Settings → Agents says how to add one.
            </p>
          )}
          <PermissionsPicker value={permissions} onChange={setPermissions} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={isStarting || agent === null || prompt.trim() === ''}
          >
            {isStarting ? 'Starting…' : 'Start run'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
