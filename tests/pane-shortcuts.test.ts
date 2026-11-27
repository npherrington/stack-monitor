import assert from 'node:assert/strict'
import { test } from 'node:test'

import { paneCommand, type PaneCommand } from '../web/lib/pane-shortcuts.ts'

const press = (code: string, keys: string) => ({
  code,
  metaKey: keys.includes('cmd'),
  ctrlKey: keys.includes('ctrl'),
  altKey: keys.includes('alt'),
  shiftKey: keys.includes('shift'),
})

test('⌘ keys run pane commands; the keys a terminal needs stay its own', () => {
  const cases: [string, string, PaneCommand | null][] = [
    ['KeyD', 'cmd', { type: 'split', edge: 'right' }],
    ['KeyD', 'cmd shift', { type: 'split', edge: 'bottom' }],
    ['KeyW', 'cmd', { type: 'close-tab' }],
    ['ArrowLeft', 'cmd alt', { type: 'focus', edge: 'left' }],
    ['ArrowRight', 'cmd alt', { type: 'focus', edge: 'right' }],
    ['ArrowUp', 'cmd alt', { type: 'focus', edge: 'top' }],
    ['ArrowDown', 'cmd alt', { type: 'focus', edge: 'bottom' }],
    ['BracketLeft', 'cmd shift', { type: 'cycle-tab', step: -1 }],
    ['BracketRight', 'cmd shift', { type: 'cycle-tab', step: 1 }],
    ['KeyD', 'ctrl', null],
    ['KeyW', 'ctrl', null],
    ['KeyD', 'cmd ctrl', null],
    ['ArrowLeft', 'alt', null],
    ['ArrowLeft', 'cmd', null],
    ['KeyD', '', null],
    ['KeyB', 'cmd', null],
  ]
  for (const [code, keys, command] of cases)
    assert.deepEqual(paneCommand(press(code, keys)), command, `${keys} ${code}`)
})
