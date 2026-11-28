import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import type { StackMap } from '../../core/types.ts'
import { getJson } from '@/lib/api.ts'

// Not under featureMapKey: refreshing the overview after a delete or a rename must not read the
// map on screen again, which would find it gone.
export const stackMapKey = (root: string | null, name: string | null) =>
  ['stack-map', root, name] as const

interface UseStackMapResult {
  map: StackMap | null
  isPending: boolean
  error: Error | null
}

// One saved map. The editor takes it once when it opens, so a map is read afresh each time it's
// opened rather than served from the cache.
export function useStackMap(
  root: string | null,
  name: string | null,
): UseStackMapResult {
  const enabled = root !== null && name !== null
  const { data, isPending, error } = useQuery({
    queryKey: stackMapKey(root, name),
    queryFn: () =>
      getJson<StackMap>(
        `/api/feature-map/map?root=${encodeURIComponent(root ?? '')}&name=${encodeURIComponent(name ?? '')}`,
      ),
    enabled,
    gcTime: 0,
  })
  return useMemo(
    () => ({ map: data ?? null, isPending: enabled && isPending, error }),
    [data, enabled, isPending, error],
  )
}
