import { useRef, useState } from 'react'

import { Intro } from '@/components/layouts/intro.tsx'
import { Sidebar } from '@/components/layouts/sidebar.tsx'
import { Workspace } from '@/components/layouts/workspace.tsx'
import { introSeen } from '@/lib/intro.ts'
import { TerminalProvider } from '@/providers/terminal-provider.tsx'

// The sidebar and the workspace fill the window; the page scrolls inside its own pane.
export function AppShell() {
  const logo = useRef<HTMLImageElement>(null)
  const [intro, setIntro] = useState(() => !introSeen())
  return (
    <TerminalProvider>
      <div className="flex h-dvh flex-col md:flex-row">
        <Sidebar logoRef={logo} hideLogo={intro} />
        <Workspace />
        {intro && <Intro target={logo} onDone={() => setIntro(false)} />}
      </div>
    </TerminalProvider>
  )
}
