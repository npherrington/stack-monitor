import { useCallback, useMemo, useState } from 'react'

import {
  readFilters,
  readPrefs,
  saveFilters,
  savePrefs,
  type CheckoutFilters,
  type CheckoutPref,
  type CheckoutPrefs,
} from '@/lib/checkout-prefs.ts'

interface UseCheckoutPrefsResult {
  prefs: CheckoutPrefs
  filters: CheckoutFilters
  updatePref: (path: string, change: Partial<CheckoutPref>) => void
  setFilters: (filters: CheckoutFilters) => void
}

// The Checkouts page's per-browser state, read before the first render so cards don't jump.
export function useCheckoutPrefs(): UseCheckoutPrefsResult {
  const [prefs, setPrefs] = useState<CheckoutPrefs>(() => readPrefs())
  const [filters, setFiltersState] = useState<CheckoutFilters>(() =>
    readFilters(),
  )

  const updatePref = useCallback(
    (path: string, change: Partial<CheckoutPref>) => {
      setPrefs((current) => {
        const next = { ...current, [path]: { ...current[path], ...change } }
        savePrefs(next)
        return next
      })
    },
    [],
  )

  const setFilters = useCallback((next: CheckoutFilters) => {
    saveFilters(next)
    setFiltersState(next)
  }, [])

  return useMemo(
    () => ({ prefs, filters, updatePref, setFilters }),
    [prefs, filters, updatePref, setFilters],
  )
}
