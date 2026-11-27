import type { ReactNode } from 'react'

import { TerminalContext } from '@/contexts/terminal-context.ts'
import { useTerminalProviderState } from '@/providers/use-terminal-provider-state.ts'

export function TerminalProvider({ children }: { children: ReactNode }) {
  const value = useTerminalProviderState()
  return (
    <TerminalContext.Provider value={value}>
      {children}
    </TerminalContext.Provider>
  )
}
