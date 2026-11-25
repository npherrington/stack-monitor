import { useId } from 'react'

import type { AgentChoice, AgentsOverview } from '../../../core/types.ts'
import { Segmented } from '@/components/stack/segmented.tsx'
import { Input } from '@/components/ui/input.tsx'

interface AgentPickerProps {
  overview: AgentsOverview
  value: AgentChoice
  onChange: (choice: AgentChoice) => void
}

// Which installed agent, and which of its models: the agent's own list is offered, any other typed.
export function AgentPicker({ overview, value, onChange }: AgentPickerProps) {
  const listId = useId()
  const installed = overview.agents.filter((agent) => agent.installed)
  const agent = overview.agents.find(
    (candidate) => candidate.id === value.agent,
  )
  if (installed.length === 0) {
    return (
      <p className="text-sm text-destructive">
        No agent CLI is installed. Settings → Agents says how to add one.
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      <Segmented
        label="Agent"
        options={installed.map((candidate) => ({
          value: candidate.id,
          label: candidate.label,
        }))}
        value={value.agent}
        onChange={(id) =>
          onChange({
            agent: id,
            model:
              overview.agents.find((candidate) => candidate.id === id)?.model ??
              null,
          })
        }
      />
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={`${listId}-model`}
          className="text-sm font-semibold text-strong"
        >
          Model
        </label>
        <Input
          id={`${listId}-model`}
          list={listId}
          value={value.model ?? ''}
          placeholder={agent?.model ?? 'the agent’s default'}
          onChange={(event) =>
            onChange({ ...value, model: event.target.value.trim() || null })
          }
          autoComplete="off"
          spellCheck={false}
          className="font-mono"
        />
        <datalist id={listId}>
          {agent?.models.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </datalist>
      </div>
    </div>
  )
}
