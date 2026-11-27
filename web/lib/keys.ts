// Keys typed into a field, where a page shortcut shouldn't act. xterm reads keys through a hidden
// textarea: `terminal` says whether that counts as a field too.
export function typingInField(
  target: EventTarget | null,
  terminal: boolean,
): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.closest('.xterm') !== null) return terminal
  return (
    target.isContentEditable ||
    target.closest('input, textarea, select') !== null
  )
}
