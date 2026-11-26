import { useCallback, useMemo, useState, type ReactNode } from 'react'

import { TerminalContext } from '@/contexts/terminal-context.ts'
import { useTerminals } from '@/hooks/use-terminals.ts'
import { toastFailure } from '@/lib/toast-failure.ts'

export function TerminalProvider({ children }: { children: ReactNode }) {
  const { sessions, open, close: closeSession } = useTerminals()
  const [shown, setShown] = useState(false)
  const [picked, setActive] = useState<string | null>(null)
  const [busy, setBusyIds] = useState<ReadonlySet<string>>(() => new Set())
  // The picked tab while it's still open, else the newest.
  const active =
    sessions.find((session) => session.id === picked)?.id ??
    sessions.at(-1)?.id ??
    null

  const openFor = useCallback(
    (target: { root: string; path: string }) => {
      setShown(true)
      open(target).then(
        (session) => setActive(session.id),
        (error: Error) => toastFailure("Couldn't open a terminal", error),
      )
    },
    [open],
  )

  const close = useCallback(
    (id: string) => {
      closeSession(id).catch((error: Error) =>
        toastFailure("Couldn't close the terminal", error),
      )
    },
    [closeSession],
  )

  // Each terminal says when Claude starts and stops working; a repeat changes nothing.
  const setBusy = useCallback((id: string, working: boolean) => {
    setBusyIds((current) => {
      if (current.has(id) === working) return current
      const next = new Set(current)
      if (working) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const value = useMemo(
    () => ({
      sessions,
      shown,
      setShown,
      active,
      setActive,
      openFor,
      close,
      busy,
      setBusy,
    }),
    [sessions, shown, active, openFor, close, busy, setBusy],
  )
  return (
    <TerminalContext.Provider value={value}>
      {children}
    </TerminalContext.Provider>
  )
}
