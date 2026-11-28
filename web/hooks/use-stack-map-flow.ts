import { useCallback, useMemo } from 'react'

import type { StackMap } from '../../core/types.ts'
import { useStackMapMutations } from '@/hooks/use-stack-map-mutations.ts'
import type { UseStackMapRouteResult } from '@/hooks/use-stack-map-route.ts'
import { blankMap } from '@/lib/stack-map-canvas.ts'

interface UseStackMapFlowResult {
  save: (from: string | null, name: string, map: StackMap) => Promise<void>
  remove: (name: string) => Promise<void>
  isSaving: boolean
  isDeleting: boolean
}

// The Stack map's actions that end somewhere else: a save under a new name (a first save, or a
// rename) opens the map under that name, and a delete leaves a blank map. Each rejects once its
// toast has said why, so the dialog that asked stays open.
export function useStackMapFlow(
  root: string,
  route: UseStackMapRouteResult,
): UseStackMapFlowResult {
  const { saveMap, deleteMap, isSaving, isDeleting } =
    useStackMapMutations(root)
  const { openMap, startDraft } = route

  const save = useCallback(
    async (from: string | null, name: string, map: StackMap) => {
      await saveMap({ name, map, replacing: from })
      if (name !== from) openMap(root, name)
    },
    [saveMap, openMap, root],
  )
  const remove = useCallback(
    async (name: string) => {
      await deleteMap(name)
      startDraft(root, blankMap())
    },
    [deleteMap, startDraft, root],
  )

  return useMemo(
    () => ({ save, remove, isSaving, isDeleting }),
    [save, remove, isSaving, isDeleting],
  )
}
