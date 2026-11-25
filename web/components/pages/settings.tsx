import type { ReactNode } from 'react'

import { AgentsSettings } from '@/components/agents/agents-settings.tsx'
import { AddRepoForm } from '@/components/repos/add-repo-form.tsx'
import { RepoList } from '@/components/repos/repo-list.tsx'
import { ScanRepos } from '@/components/repos/scan-repos.tsx'
import { ThemePicker } from '@/components/settings/theme-picker.tsx'
import { Card } from '@/components/ui/card.tsx'

function Section({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <Card className="gap-4 px-6 py-6">
      <div>
        <h2 className="text-lg font-extrabold text-strong">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </Card>
  )
}

export function Settings() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-extrabold text-strong">Settings</h1>
      <Section
        title="Repos"
        description="The repos on this machine whose worktrees the Checkouts page shows."
      >
        <RepoList />
        <AddRepoForm />
      </Section>
      <Section
        title="Find repos"
        description="Look through a folder for git repos, a few levels deep, and add the ones you pick."
      >
        <ScanRepos />
      </Section>
      <Section
        title="Agents"
        description="The coding-agent CLIs on this machine, which runs, skills and workflows start. Each keeps its own login: no keys are stored here."
      >
        <AgentsSettings />
      </Section>
      <Section title="Theme" description="Remembered in this browser.">
        <div className="max-w-sm">
          <ThemePicker />
        </div>
      </Section>
    </div>
  )
}
