import { createHashRouter } from 'react-router'

import { AppShell } from '@/components/layouts/app-shell.tsx'
import { Checkouts } from '@/components/pages/checkouts.tsx'
import { Settings } from '@/components/pages/settings.tsx'
import { StackSettings } from '@/components/pages/stack-settings.tsx'

// Hash routes, so a deep link loads from any URL the page is served at without the server knowing
// the routes, and the relative asset paths (vite.config.ts `base`) keep resolving.
export const router = createHashRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <Checkouts /> },
      { path: 'settings', element: <Settings /> },
      { path: 'settings/stack/:root', element: <StackSettings /> },
    ],
  },
])
