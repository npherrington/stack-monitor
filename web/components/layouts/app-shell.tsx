import { useRef, useState } from 'react'
import { Outlet } from 'react-router'

import { Intro } from '@/components/layouts/intro.tsx'
import { Sidebar } from '@/components/layouts/sidebar.tsx'
import { TerminalPanel } from '@/components/terminals/terminal-panel.tsx'
import { introSeen } from '@/lib/intro.ts'
import { TerminalProvider } from '@/providers/terminal-provider.tsx'

export function AppShell() {
  const logo = useRef<HTMLImageElement>(null)
  const [intro, setIntro] = useState(() => !introSeen())
  return (
    <TerminalProvider>
      <div className="flex min-h-dvh flex-col md:flex-row">
        <Sidebar logoRef={logo} hideLogo={intro} />
        <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
          <div className="mx-auto max-w-6xl">
            <Outlet />
          </div>
        </main>
        <TerminalPanel />
        {intro && <Intro target={logo} onDone={() => setIntro(false)} />}
      </div>
    </TerminalProvider>
  )
}
