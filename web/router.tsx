import { createHashRouter } from 'react-router'

import { AppShell } from '@/components/layouts/app-shell.tsx'
import { Agents } from '@/components/pages/agents.tsx'
import { Checkouts } from '@/components/pages/checkouts.tsx'
import { Github } from '@/components/pages/github.tsx'
import { Schedules } from '@/components/pages/schedules.tsx'
import { Settings } from '@/components/pages/settings.tsx'
import { StackSettings } from '@/components/pages/stack-settings.tsx'
import { TicketBoard } from '@/components/pages/ticket-board.tsx'
import { WorktreeSettings } from '@/components/pages/worktree-settings.tsx'

// Hash routes, so a deep link loads from any URL the page is served at without the server knowing
// the routes, and the relative asset paths (vite.config.ts `base`) keep resolving.
export const router = createHashRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <Checkouts /> },
      { path: 'agents', element: <Agents /> },
      { path: 'schedules', element: <Schedules /> },
      { path: 'github', element: <Github /> },
      { path: 'board', element: <TicketBoard /> },
      { path: 'settings', element: <Settings /> },
      { path: 'settings/stack/:root', element: <StackSettings /> },
      { path: 'settings/worktrees/:root', element: <WorktreeSettings /> },
    ],
  },
])
