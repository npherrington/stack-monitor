// The keys that split, close, move between and cycle panes. ⌘ only: Ctrl+D and Ctrl+W are a
// shell's end-of-input and delete-word. Matched on `code`, since ⇧ turns `[` into `{`.
// Relative imports: tests/pane-shortcuts.test.ts runs this file under node.
import type { Edge } from './pane-layout.ts'

export type PaneCommand =
  | { type: 'split'; edge: 'right' | 'bottom' }
  | { type: 'close-tab' }
  | { type: 'focus'; edge: Edge }
  | { type: 'cycle-tab'; step: 1 | -1 }

type KeyPress = Pick<
  KeyboardEvent,
  'code' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'
>

const ARROWS: Record<string, Edge> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'top',
  ArrowDown: 'bottom',
}

export function paneCommand(key: KeyPress): PaneCommand | null {
  if (!key.metaKey || key.ctrlKey) return null
  const { code, altKey, shiftKey } = key
  if (altKey) {
    const edge = ARROWS[code]
    return !shiftKey && edge !== undefined ? { type: 'focus', edge } : null
  }
  if (code === 'KeyD')
    return { type: 'split', edge: shiftKey ? 'bottom' : 'right' }
  if (code === 'KeyW' && !shiftKey) return { type: 'close-tab' }
  if (shiftKey && code === 'BracketLeft') return { type: 'cycle-tab', step: -1 }
  if (shiftKey && code === 'BracketRight') return { type: 'cycle-tab', step: 1 }
  return null
}
