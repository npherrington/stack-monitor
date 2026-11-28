import { useCallback, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'

import type { StackMap } from '../../core/types.ts'
import { blankMap } from '@/lib/stack-map-canvas.ts'
import { readMapName, stackMapPath } from '@/lib/stack-map-links.ts'

export interface MapDraft {
  key: number // changes with each new draft, so the editor starts afresh
  map: StackMap
}

export interface UseStackMapRouteResult {
  repo: string | null // the repo the URL names
  map: string | null // the saved map the URL names; none: the draft shows
  draft: MapDraft
  openRepo: (root: string) => void
  openMap: (root: string, name: string) => void
  startDraft: (root: string, map: StackMap) => void // an unsaved map, from blank or a starter
}

// Which repo and map the Stack map shows. The URL decides, so a link opens the same map; a map
// with no file yet is a draft the browser address can't name, held here. Only the page calls it:
// a second call would hold a draft of its own.
export function useStackMapRoute(): UseStackMapRouteResult {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [draft, setDraft] = useState<MapDraft>(() => ({
    key: 0,
    map: blankMap(),
  }))
  const repo = params.get('repo')
  const map = readMapName(params.get('map'))

  const startDraft = useCallback(
    (root: string, next: StackMap) => {
      setDraft((last) => ({ key: last.key + 1, map: next }))
      void navigate(stackMapPath(root))
    },
    [navigate],
  )
  // One repo's draft never shows under another.
  const openRepo = useCallback(
    (root: string) => startDraft(root, blankMap()),
    [startDraft],
  )
  const openMap = useCallback(
    (root: string, name: string) => navigate(stackMapPath(root, name)),
    [navigate],
  )

  return useMemo(
    () => ({ repo, map, draft, openRepo, openMap, startDraft }),
    [repo, map, draft, openRepo, openMap, startDraft],
  )
}
