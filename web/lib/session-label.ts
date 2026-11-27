import type { TerminalSession } from '../../core/types.ts'
import { readPrefs } from '@/lib/checkout-prefs.ts'
import type { TabStyle } from '@/lib/pane-layout.ts'

// What a session's tab and sidebar row say: the name given to the tab, else the worktree's
// nickname, else its folder.
export function sessionLabel(
  session: TerminalSession,
  style?: TabStyle,
): string {
  return (
    style?.name ??
    readPrefs()[session.path]?.nickname ??
    session.path.split('/').filter(Boolean).pop() ??
    session.path
  )
}
