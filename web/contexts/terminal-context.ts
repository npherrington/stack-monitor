import { createContext, useContext } from 'react'

import type { TerminalSession } from '../../core/types.ts'

export interface TerminalContextValue {
  sessions: TerminalSession[]
  shown: boolean // whether the panel is open
  setShown: (shown: boolean) => void
  active: string | null // the tab showing, by session id
  setActive: (id: string) => void
  openFor: (target: { root: string; path: string }) => void // a worktree's session, started if needed
  close: (id: string) => void
  busy: ReadonlySet<string> // the sessions Claude is working in, by id
  setBusy: (id: string, busy: boolean) => void
}

export const TerminalContext = createContext<TerminalContextValue | undefined>(
  undefined,
)

export function useTerminalPanel(): TerminalContextValue {
  const context = useContext(TerminalContext)
  if (context === undefined) {
    throw new Error('useTerminalPanel must be used within a TerminalProvider')
  }
  return context
}
