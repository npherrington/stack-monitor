import { Copy } from 'lucide-react'
import { useState } from 'react'

import type {
  AgentChoice,
  AgentId,
  AgentSettings,
  AgentsOverview,
  AgentStatus,
} from '../../../core/types.ts'
import { AgentPicker } from '@/components/agents/agent-picker.tsx'
import { Segmented } from '@/components/stack/segmented.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Input } from '@/components/ui/input.tsx'
import { Pill } from '@/components/ui/pill.tsx'
import { Skeleton } from '@/components/ui/skeleton.tsx'
import { StatusDot } from '@/components/ui/status-dot.tsx'
import { toast } from '@/components/ui/toast-manager.ts'
import { useAgents } from '@/hooks/use-agents.ts'

// The agent CLIs on this machine. Each keeps its own login; the monitor never holds a key, and a
// dev who wants their own API key uses it through OpenCode.
export function AgentsSettings() {
  const { overview, isPending, error } = useAgents()
  if (isPending) return <Skeleton className="h-48" />
  if (error !== null || overview === null) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {error?.message ?? "The monitor didn't send the agents."}
      </p>
    )
  }
  return <AgentsForm key={JSON.stringify(overview)} overview={overview} />
}

function copy(command: string) {
  navigator.clipboard.writeText(command).then(
    () => toast.add({ title: `Copied: ${command}` }),
    () => toast.add({ title: command }),
  )
}

function CommandLine({ label, command }: { label: string; command: string }) {
  return (
    <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      {label}
      <code className="rounded-lg bg-secondary px-2 py-0.5 font-mono text-xs text-strong">
        {command}
      </code>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Copy ${command}`}
        onClick={() => copy(command)}
      >
        <Copy />
      </Button>
    </p>
  )
}

function AgentsForm({ overview }: { overview: AgentsOverview }) {
  const { saveSettings, isSaving } = useAgents()
  const installed = overview.agents.filter((agent) => agent.installed)
  const [defaultAgent, setDefaultAgent] = useState<AgentId | null>(
    overview.default,
  )
  const [models, setModels] = useState<Partial<Record<AgentId, string>>>(() =>
    Object.fromEntries(
      overview.agents.map((agent) => [agent.id, agent.model ?? '']),
    ),
  )
  const [designer, setDesigner] = useState<AgentChoice | null>(
    overview.designer,
  )

  const save = () => {
    const settings: AgentSettings = {
      default: defaultAgent ?? undefined,
      designer: designer ?? undefined,
      agents: Object.fromEntries(
        overview.agents.map((agent) => [
          agent.id,
          { model: models[agent.id]?.trim() || undefined },
        ]),
      ),
    }
    saveSettings(settings)
  }

  return (
    <div className="flex flex-col gap-5">
      <ul className="grid gap-3 lg:grid-cols-2">
        {overview.agents.map((agent) => (
          <AgentRow
            key={agent.id}
            agent={agent}
            model={models[agent.id] ?? ''}
            onModel={(model) =>
              setModels((current) => ({ ...current, [agent.id]: model }))
            }
          />
        ))}
      </ul>

      {installed.length > 0 && defaultAgent !== null && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-strong">
            Run here starts with
          </p>
          <Segmented
            label="Default agent"
            options={installed.map((agent) => ({
              value: agent.id,
              label: agent.label,
            }))}
            value={defaultAgent}
            onChange={setDefaultAgent}
          />
        </div>
      )}

      <div className="flex flex-col gap-2 rounded-2xl border bg-card/60 p-4">
        <p className="text-sm font-semibold text-strong">
          Skill and prompt designer
        </p>
        <p className="text-sm text-muted-foreground">
          Drafts new skills and sharpens prompts on the Agents page. A free
          OpenCode model is the default when OpenCode is installed; its prompts
          go to OpenCode’s hosted model. An Ollama model keeps them on this
          machine.
        </p>
        {designer !== null ? (
          <AgentPicker
            overview={overview}
            value={designer}
            onChange={setDesigner}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Install an agent CLI to choose one.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2 rounded-2xl border bg-card/60 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-strong">
          <StatusDot state={overview.ollama.running ? 'up' : 'down'} />
          Ollama {overview.ollama.running ? `is running` : 'isn’t running'}
          {overview.ollama.version !== null && (
            <Pill>{overview.ollama.version}</Pill>
          )}
        </p>
        <p className="text-sm text-muted-foreground">
          Local models, used through OpenCode as{' '}
          <code>ollama/&lt;model&gt;</code>.
        </p>
        {overview.ollama.models.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {overview.ollama.models.map((model) => (
              <Pill key={model}>{model}</Pill>
            ))}
          </div>
        )}
      </div>

      <Button className="self-start" onClick={save} disabled={isSaving}>
        {isSaving ? 'Saving…' : 'Save agent settings'}
      </Button>
    </div>
  )
}

interface AgentRowProps {
  agent: AgentStatus
  model: string
  onModel: (model: string) => void
}

function AgentRow({ agent, model, onModel }: AgentRowProps) {
  const listId = `models-${agent.id}`
  return (
    <li className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusDot state={agent.installed ? 'up' : 'down'} />
        <span className="font-bold text-strong">{agent.label}</span>
        {agent.version !== null && <Pill>{agent.version}</Pill>}
        {agent.installed && agent.login.state === 'no' && (
          <Pill tone="attention">not logged in</Pill>
        )}
      </div>
      {agent.installed ? (
        <>
          <p className="truncate font-mono text-xs text-muted-foreground">
            {agent.path}
          </p>
          {agent.login.state !== 'yes' && (
            <CommandLine label="Log in with" command={agent.login.command} />
          )}
          {agent.login.note !== null && (
            <p className="text-xs text-muted-foreground">{agent.login.note}</p>
          )}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={`model-${agent.id}`}
              className="text-sm font-semibold text-strong"
            >
              Default model
            </label>
            <Input
              id={`model-${agent.id}`}
              list={listId}
              value={model}
              placeholder="the CLI’s own default"
              onChange={(event) => onModel(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="font-mono"
            />
            <datalist id={listId}>
              {agent.models.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </datalist>
          </div>
        </>
      ) : (
        <CommandLine label="Install with" command={agent.install} />
      )}
    </li>
  )
}
