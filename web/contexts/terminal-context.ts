import { createContext, useContext } from 'react'

import type { TerminalSession } from '../../core/types.ts'
import type { TerminalTarget } from '@/hooks/use-terminals.ts'
import type {
  Edge,
  PaneLayout,
  TabStyle,
  TabStyles,
  TabTarget,
} from '@/lib/pane-layout.ts'

export interface TerminalContextValue {
  sessions: TerminalSession[]
  busy: ReadonlySet<string> // the sessions Claude is working in, by id
  setBusy: (id: string, busy: boolean) => void
  layout: PaneLayout // reconciled against the sessions
  tabStyles: TabStyles
  // A worktree's claude tab if one is open, else a new session: in the focused pane, or `where`.
  openFor: (
    target: TerminalTarget,
    where?: { beside: string; edge: Edge },
  ) => void
  close: (id: string) => void // a running claude session asks first, through pendingClose
  pendingClose: string | null
  confirmClose: () => void
  cancelClose: () => void
  focusSession: (id: string) => void // shows its tab, focuses its pane, shows the terminals
  focusPane: (pane: string) => void
  split: (pane: string, edge: 'right' | 'bottom') => void // a new shell in its active tab's worktree
  moveTab: (id: string, to: TabTarget) => void
  movePage: (beside: string, edge: Edge) => void
  cycleTab: (pane: string, step: 1 | -1) => void
  setSizes: (split: string, sizes: number[]) => void
  setHidden: (part: 'page' | 'terminals', hidden: boolean) => void
  styleTab: (id: string, style: TabStyle) => void
}

export const TerminalContext = createContext<TerminalContextValue | undefined>(
  undefined,
)

export function useTerminalLayout(): TerminalContextValue {
  const context = useContext(TerminalContext)
  if (context === undefined) {
    throw new Error('useTerminalLayout must be used within a TerminalProvider')
  }
  return context
}
