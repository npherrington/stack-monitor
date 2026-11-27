import { useTerminalLayout } from '@/contexts/terminal-context.ts'

const LIVE_MS = 3_000

// How often the board re-reads: every few seconds while a session started from the board is open,
// since its tools write tickets; otherwise not at all, and the refetch on focus and after an
// action is what shows a change.
export function useBoardInterval(): number | false {
  const { sessions } = useTerminalLayout()
  return sessions.some(
    (session) =>
      session.exitCode === null &&
      (session.task === 'ticket' || session.task === 'product'),
  )
    ? LIVE_MS
    : false
}
