import { useState } from 'react'

import type {
  ClaudeWorkflow,
  RunClaudeWorkflowRequest,
  RunPermissions,
} from '../../../core/types.ts'
import { PermissionsPicker } from '@/components/agents/permissions-picker.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Checkbox } from '@/components/ui/checkbox.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.tsx'
import { Field, FieldLabel } from '@/components/ui/field.tsx'
import { Input } from '@/components/ui/input.tsx'
import { Textarea } from '@/components/ui/textarea.tsx'
import { useStartRun } from '@/hooks/use-runs.ts'

interface ClaudeWorkflowDialogProps {
  workflow: ClaudeWorkflow | null // open while set
  checkout: string | undefined
  onClose: () => void
  onStarted: (runId: string) => void
}

export function ClaudeWorkflowDialog({
  workflow,
  checkout,
  onClose,
  onStarted,
}: ClaudeWorkflowDialogProps) {
  return (
    <Dialog
      open={workflow !== null}
      onOpenChange={(open) => !open && onClose()}
    >
      <DialogContent className="sm:max-w-xl">
        {workflow !== null && (
          <RunForm
            key={workflow.name}
            workflow={workflow}
            checkout={checkout}
            onClose={onClose}
            onStarted={onStarted}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

// A launcher's options are its manifest's; a bare script takes notes and the run's permissions.
function RunForm({
  workflow,
  checkout,
  onClose,
  onStarted,
}: Omit<ClaudeWorkflowDialogProps, 'workflow'> & {
  workflow: ClaudeWorkflow
}) {
  const { start, isStarting } = useStartRun()
  const [testRun, setTestRun] = useState(workflow.testRun)
  const [argument, setArgument] = useState('')
  const [notes, setNotes] = useState('')
  const [permissions, setPermissions] = useState<RunPermissions>('full')
  const needsArgument = workflow.argument !== 'none'

  const submit = async () => {
    if (checkout === undefined) return
    const request: RunClaudeWorkflowRequest = {
      checkout,
      name: workflow.name,
      ...(workflow.testRun ? { testRun } : {}),
      ...(notes.trim() === '' ? {} : { notes: notes.trim() }),
      ...(needsArgument ? { argument: argument.trim() } : {}),
      ...(workflow.launcher ? {} : { permissions }),
    }
    try {
      onStarted(await start('/api/workflows/run-claude', request))
    } catch {
      // The start's toast says why; the form stays as it was.
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{workflow.label}</DialogTitle>
        <DialogDescription className="truncate font-mono text-xs">
          {checkout}
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-4">
        {workflow.description !== '' && (
          <p className="text-sm text-muted-foreground">
            {workflow.description}
          </p>
        )}
        {needsArgument && (
          <Field>
            <FieldLabel htmlFor="workflow-argument">
              {workflow.argumentLabel ?? workflow.argument}
            </FieldLabel>
            <Input
              id="workflow-argument"
              value={argument}
              onChange={(event) => setArgument(event.target.value)}
              placeholder={
                workflow.argument === 'text' ? '' : 'ABC-123, ABC-124'
              }
              autoComplete="off"
              spellCheck={false}
              className="font-mono"
            />
          </Field>
        )}
        <Field>
          <FieldLabel htmlFor="workflow-notes">Instructions</FieldLabel>
          <Textarea
            id="workflow-notes"
            rows={3}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Optional. Every stage reads it: only the sign-up flows, say."
          />
        </Field>
        {workflow.testRun && (
          <Field orientation="horizontal">
            <Checkbox
              id="workflow-test-run"
              checked={testRun}
              onCheckedChange={setTestRun}
            />
            <FieldLabel htmlFor="workflow-test-run">
              Test run: drafts what it would publish, publishes nothing
            </FieldLabel>
          </Field>
        )}
        {!workflow.launcher && (
          <PermissionsPicker value={permissions} onChange={setPermissions} />
        )}
        {workflow.cost !== null && (
          <p className="text-sm text-warning">{workflow.cost}</p>
        )}
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={submit}
          disabled={
            isStarting ||
            checkout === undefined ||
            (needsArgument && argument.trim() === '')
          }
        >
          {isStarting ? 'Starting…' : testRun ? 'Start test run' : 'Start run'}
        </Button>
      </DialogFooter>
    </>
  )
}
