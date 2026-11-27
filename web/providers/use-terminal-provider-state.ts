import { useCallback, useEffect, useMemo, useState } from 'react'

import type { TerminalContextValue } from '@/contexts/terminal-context.ts'
import { useTerminals, type TerminalTarget } from '@/hooks/use-terminals.ts'
import {
  cycleTab as cycleTabIn,
  focusPane as focusPaneIn,
  activate,
  findPane,
  moveTab as moveTabIn,
  movePage as movePageIn,
  placeSession,
  reconcile,
  setHidden as setHiddenIn,
  setSizes as setSizesIn,
  type Edge,
  type PaneLayout,
  type TabStyle,
  type TabTarget,
} from '@/lib/pane-layout.ts'
import {
  readLayout,
  storeLayout,
  type StoredLayout,
} from '@/lib/pane-layout-store.ts'
import { toastFailure } from '@/lib/toast-failure.ts'

const newId = () => crypto.randomUUID()

// The terminal sessions, which come from the server, and how this browser lays them out beside
// the page, which it keeps. The layout shown is the stored one reconciled against the session
// list on each render; an action applies to that and stores the result, so ended sessions leave
// storage the first time anything changes.
export function useTerminalProviderState(): TerminalContextValue {
  const { sessions, loaded, open, close: closeSession } = useTerminals()
  const [stored, setStored] = useState<StoredLayout>(readLayout)
  const [busy, setBusyIds] = useState<ReadonlySet<string>>(() => new Set())
  const [pendingClose, setPendingClose] = useState<string | null>(null)

  const ids = useMemo(() => sessions.map((session) => session.id), [sessions])
  // Until the list first answers, every stored session would look ended: show the page alone.
  const layout = useMemo(
    () =>
      loaded
        ? reconcile(stored.layout, ids)
        : { ...stored.layout, terminalsHidden: true },
    [loaded, stored.layout, ids],
  )

  const tabStyles = useMemo(
    () =>
      loaded
        ? Object.fromEntries(
            Object.entries(stored.tabStyles).filter(([id]) => ids.includes(id)),
          )
        : stored.tabStyles,
    [loaded, stored.tabStyles, ids],
  )

  useEffect(() => {
    if (loaded) storeLayout({ layout, tabStyles })
  }, [loaded, layout, tabStyles])

  const apply = useCallback(
    (change: (layout: PaneLayout) => PaneLayout) =>
      setStored((current) => {
        const base = loaded ? reconcile(current.layout, ids) : current.layout
        const next = change(base)
        return next === base ? current : { ...current, layout: next }
      }),
    [loaded, ids],
  )

  const openFor = useCallback(
    (target: TerminalTarget, where?: { beside: string; edge: Edge }) => {
      const running = sessions.find(
        (session) =>
          (target.kind ?? 'claude') === 'claude' &&
          session.kind === 'claude' &&
          session.path === target.path &&
          session.exitCode === null,
      )
      if (running !== undefined && where === undefined) {
        apply((current) => activate(current, running.id))
        return
      }
      open(target).then(
        (session) =>
          apply((current) => placeSession(current, session.id, newId, where)),
        (error: Error) => toastFailure("Couldn't open a terminal", error),
      )
    },
    [sessions, open, apply],
  )

  const end = useCallback(
    (id: string) => {
      closeSession(id).catch((error: Error) =>
        toastFailure("Couldn't close the terminal", error),
      )
    },
    [closeSession],
  )

  const close = useCallback(
    (id: string) => {
      const session = sessions.find((each) => each.id === id)
      if (session?.kind === 'claude' && session.exitCode === null)
        setPendingClose(id)
      else end(id)
    },
    [sessions, end],
  )

  const confirmClose = useCallback(() => {
    if (pendingClose !== null) end(pendingClose)
    setPendingClose(null)
  }, [pendingClose, end])

  const cancelClose = useCallback(() => setPendingClose(null), [])

  const focusSession = useCallback(
    (id: string) => apply((current) => activate(current, id)),
    [apply],
  )

  const showSession = useCallback(
    (id: string) => apply((current) => placeSession(current, id, newId)),
    [apply],
  )

  const focusPane = useCallback(
    (pane: string) => apply((current) => focusPaneIn(current, pane)),
    [apply],
  )

  const split = useCallback(
    (pane: string, edge: 'right' | 'bottom') => {
      const active = findPane(layout.root, pane)?.active
      const session = sessions.find((each) => each.id === active)
      if (session === undefined) return
      openFor(
        { root: session.root, path: session.path, kind: 'shell' },
        { beside: pane, edge },
      )
    },
    [layout.root, sessions, openFor],
  )

  const moveTab = useCallback(
    (id: string, to: TabTarget) =>
      apply((current) => moveTabIn(current, id, to, newId)),
    [apply],
  )

  const movePage = useCallback(
    (beside: string, edge: Edge) =>
      apply((current) => movePageIn(current, beside, edge, newId)),
    [apply],
  )

  const cycleTab = useCallback(
    (pane: string, step: 1 | -1) =>
      apply((current) => cycleTabIn(current, pane, step)),
    [apply],
  )

  const setSizes = useCallback(
    (splitId: string, sizes: number[]) =>
      apply((current) => setSizesIn(current, splitId, sizes)),
    [apply],
  )

  const setHidden = useCallback(
    (part: 'page' | 'terminals', hidden: boolean) =>
      apply((current) => setHiddenIn(current, part, hidden)),
    [apply],
  )

  const styleTab = useCallback(
    (id: string, style: TabStyle) =>
      setStored((current) => {
        const { [id]: _old, ...rest } = current.tabStyles
        const name = style.name?.trim()
        const kept: TabStyle = {
          ...(name ? { name } : {}),
          ...(style.colour ? { colour: style.colour } : {}),
        }
        return {
          ...current,
          tabStyles:
            Object.keys(kept).length > 0 ? { ...rest, [id]: kept } : rest,
        }
      }),
    [],
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

  return useMemo(
    () => ({
      sessions,
      busy,
      setBusy,
      layout,
      tabStyles,
      openFor,
      close,
      pendingClose,
      confirmClose,
      cancelClose,
      focusSession,
      showSession,
      focusPane,
      split,
      moveTab,
      movePage,
      cycleTab,
      setSizes,
      setHidden,
      styleTab,
    }),
    [
      sessions,
      busy,
      setBusy,
      layout,
      tabStyles,
      openFor,
      close,
      pendingClose,
      confirmClose,
      cancelClose,
      focusSession,
      showSession,
      focusPane,
      split,
      moveTab,
      movePage,
      cycleTab,
      setSizes,
      setHidden,
      styleTab,
    ],
  )
}
