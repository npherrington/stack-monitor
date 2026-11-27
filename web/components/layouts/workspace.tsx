import { lazy, Suspense, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Outlet } from 'react-router'

import { NarrowPanes } from '@/components/panes/narrow-panes.tsx'
import { PaneTree } from '@/components/panes/pane-tree.tsx'
import { CloseSessionDialog } from '@/components/terminals/close-session-dialog.tsx'
import { useTerminalLayout } from '@/contexts/terminal-context.ts'
import { useMediaQuery } from '@/hooks/use-media-query.ts'
import { usePaneShortcuts } from '@/hooks/use-pane-shortcuts.ts'
import { held, releaseExcept } from '@/lib/held-elements.ts'
import { findPane, paneOf } from '@/lib/pane-layout.ts'

// xterm is most of a megabyte: it loads the first time a session shows.
const TerminalView = lazy(() =>
  import('@/components/terminals/terminal-view.tsx').then((module) => ({
    default: module.TerminalView,
  })),
)

// Everything right of the sidebar: the page and the terminal panes. The page and each session's
// terminal render once, here, into elements the panes adopt (lib/held-elements.ts), so their place
// in this React tree never changes however the panes are arranged.
export function Workspace() {
  const { sessions, layout } = useTerminalLayout()
  const wide = useMediaQuery('(min-width: 48rem)')
  usePaneShortcuts(wide)

  const ids = sessions.map((session) => session.id).join(' ')
  useEffect(() => {
    releaseExcept(new Set(['page', ...ids.split(' ')]))
  }, [ids])

  const focusedPane = layout.terminalsHidden
    ? undefined
    : findPane(layout.root, layout.focused)

  return (
    <>
      {wide ? <PaneTree /> : <NarrowPanes />}
      {createPortal(<Outlet />, held('page'))}
      {sessions.map((session) =>
        createPortal(
          <Suspense fallback={<div className="flex-1" />}>
            <TerminalView
              id={session.id}
              kind={session.kind}
              focused={
                focusedPane?.active === session.id &&
                paneOf(layout.root, session.id) === focusedPane
              }
            />
          </Suspense>,
          held(session.id),
          session.id,
        ),
      )}
      <CloseSessionDialog />
    </>
  )
}
