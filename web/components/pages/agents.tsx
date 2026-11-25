import { Link } from 'react-router'
import { useState } from 'react'

import { RunList } from '@/components/agents/run-list.tsx'
import { RunLogDialog } from '@/components/agents/run-log-dialog.tsx'
import { SkillsPanel } from '@/components/agents/skills-panel.tsx'
import { WorkflowsPanel } from '@/components/agents/workflows-panel.tsx'
import { Segmented } from '@/components/stack/segmented.tsx'
import { Skeleton } from '@/components/ui/skeleton.tsx'
import { useAgents } from '@/hooks/use-agents.ts'
import { useCheckouts } from '@/hooks/use-checkouts.ts'
import { useRuns } from '@/hooks/use-runs.ts'

type Panel = 'skills' | 'workflows' | 'runs'

// The agentic framework: design skills, build workflows, and every run's log, for one repo at a time.
export function Agents() {
  const { repos, isPending } = useCheckouts()
  const { overview } = useAgents()
  const { runs } = useRuns()
  const [root, setRoot] = useState<string | null>(null)
  const [panel, setPanel] = useState<Panel>('skills')
  const [openRun, setOpenRun] = useState<string | null>(null)
  const current = repos.find((repo) => repo.root === root) ?? repos[0]

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <h1 className="text-2xl font-extrabold text-strong">Agents</h1>
        <p className="text-muted-foreground">
          Design skills, build workflows and follow every run, with whichever
          agent CLI you use. Settings → Agents sets which ones.
        </p>
        {repos.length > 1 && (
          <Segmented
            label="Repo"
            options={repos.map((repo) => ({
              value: repo.root,
              label: repo.name,
            }))}
            value={current?.root ?? ''}
            onChange={setRoot}
          />
        )}
        <Segmented
          label="Section"
          options={[
            { value: 'skills', label: 'Skills' },
            { value: 'workflows', label: 'Workflows' },
            { value: 'runs', label: 'Runs' },
          ]}
          value={panel}
          onChange={setPanel}
        />
      </header>
      {isPending ? (
        <Skeleton className="h-64" />
      ) : current === undefined ? (
        <p className="text-muted-foreground">
          No repos yet.{' '}
          <Link to="/settings" className="font-semibold underline">
            Add one in Settings
          </Link>
          .
        </p>
      ) : panel === 'skills' ? (
        <SkillsPanel
          root={current.root}
          repo={current}
          overview={overview}
          onOpenRun={setOpenRun}
        />
      ) : panel === 'workflows' ? (
        <WorkflowsPanel
          root={current.root}
          repo={current}
          overview={overview}
          onOpenRun={setOpenRun}
        />
      ) : runs.filter((run) => run.root === current.root).length === 0 ? (
        <p className="text-muted-foreground">No runs in this repo yet.</p>
      ) : (
        <RunList
          runs={runs.filter((run) => run.root === current.root)}
          onOpen={setOpenRun}
          showCheckout
        />
      )}
      <RunLogDialog runId={openRun} onClose={() => setOpenRun(null)} />
    </div>
  )
}
