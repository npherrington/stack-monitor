import { useCallback, useMemo, useState } from 'react'

import {
  readPullPrefs,
  savePullPrefs,
  type PullPref,
  type PullPrefs,
} from '@/lib/pull-prefs.ts'

interface UsePullPrefsResult {
  prefs: PullPrefs
  updatePref: (key: string, change: Partial<PullPref>) => void
  setRanks: (ranks: Record<string, number>) => void // places in a repo's list, by pullPrefKey
}

// The PR list's per-browser state, read before the first render so rows don't jump.
export function usePullPrefs(): UsePullPrefsResult {
  const [prefs, setPrefs] = useState<PullPrefs>(() => readPullPrefs())

  const updatePref = useCallback((key: string, change: Partial<PullPref>) => {
    setPrefs((current) => {
      const next = { ...current, [key]: { ...current[key], ...change } }
      savePullPrefs(next)
      return next
    })
  }, [])

  const setRanks = useCallback((ranks: Record<string, number>) => {
    setPrefs((current) => {
      const next = { ...current }
      for (const [key, rank] of Object.entries(ranks)) {
        next[key] = { ...current[key], rank }
      }
      savePullPrefs(next)
      return next
    })
  }, [])

  return useMemo(
    () => ({ prefs, updatePref, setRanks }),
    [prefs, updatePref, setRanks],
  )
}
