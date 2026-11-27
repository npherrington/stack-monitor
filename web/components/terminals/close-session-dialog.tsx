import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog.tsx'
import { useTerminalLayout } from '@/contexts/terminal-context.ts'
import { sessionLabel } from '@/lib/session-label.ts'

// The question before ending a claude session that's still running, from a tab's ✕, its menu or
// ⌘W. A shell, or a session that has exited, closes without it.
export function CloseSessionDialog() {
  const { sessions, tabStyles, busy, pendingClose, confirmClose, cancelClose } =
    useTerminalLayout()
  const session = sessions.find((each) => each.id === pendingClose)
  const label =
    session === undefined ? '' : sessionLabel(session, tabStyles[session.id])
  return (
    <AlertDialog
      open={session !== undefined}
      onOpenChange={(open) => {
        if (!open) cancelClose()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            End the Claude session in {label}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {session !== undefined && busy.has(session.id)
              ? 'Claude is working in it right now. Ending the session stops claude where it is.'
              : 'claude is still running in it. Ending the session stops it.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => confirmClose()}
          >
            End session
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
