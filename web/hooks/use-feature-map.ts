import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import {
  BLOCK_KINDS,
  type BlockInfo,
  type BlockKind,
  type FeatureMapOverview,
} from '../../core/types.ts'
import { getJson } from '@/lib/api.ts'

export const featureMapKey = (root: string | null) =>
  ['feature-map', root] as const

export interface PaletteGroup {
  kind: BlockKind
  blocks: BlockInfo[]
}

interface UseFeatureMapResult {
  overview: FeatureMapOverview | null
  palette: PaletteGroup[] // the blocks grouped by kind, in BLOCK_KINDS order, none empty
  isPending: boolean
  error: Error | null
}

// A repo's blocks, saved maps and starters. No interval: they change when someone edits a file,
// and the refetch on focus shows it.
export function useFeatureMap(root: string | null): UseFeatureMapResult {
  const { data, isPending, error } = useQuery({
    queryKey: featureMapKey(root),
    queryFn: () =>
      getJson<FeatureMapOverview>(
        `/api/feature-map?root=${encodeURIComponent(root ?? '')}`,
      ),
    enabled: root !== null,
  })

  const palette = useMemo(
    () =>
      BLOCK_KINDS.map((kind) => ({
        kind,
        blocks: (data?.blocks ?? []).filter((block) => block.kind === kind),
      })).filter((group) => group.blocks.length > 0),
    [data],
  )

  return useMemo(
    () => ({
      overview: data ?? null,
      palette,
      isPending: root !== null && isPending,
      error,
    }),
    [data, palette, root, isPending, error],
  )
}
