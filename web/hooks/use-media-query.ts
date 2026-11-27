import { useCallback, useSyncExternalStore } from 'react'

type MatchMedia = (query: string) => MediaQueryList

const windowMatchMedia: MatchMedia = (query) => window.matchMedia(query)

// Whether the media query matches now, following it as the window changes.
export function useMediaQuery(
  query: string,
  matchMedia: MatchMedia = windowMatchMedia,
): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    [query, matchMedia],
  )
  return useSyncExternalStore(subscribe, () => matchMedia(query).matches)
}
