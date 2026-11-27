import type { TerminalSession } from '../../core/types.ts'
import { readPrefs } from '@/lib/checkout-prefs.ts'
import type { TabStyle } from '@/lib/pane-layout.ts'

// What a session's tab and sidebar row say: the name given to the tab, else the task it was
// started on (BEANS-3), else the worktree's nickname, else its folder.
export function sessionLabel(
  session: TerminalSession,
  style?: TabStyle,
): string {
  return (
    style?.name ??
    session.title ??
    readPrefs()[session.path]?.nickname ??
    session.path.split('/').filter(Boolean).pop() ??
    session.path
  )
}
