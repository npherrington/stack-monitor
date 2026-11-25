import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import type { DetectedService } from '../../core/types.ts'
import { getJson } from '@/lib/api.ts'

interface UseStackDetectResult {
  detected: DetectedService[] | null // null until asked
  isDetecting: boolean
  error: Error | null
  detect: () => void
}

// What the repo's own files suggest, read only when asked: it lists mise tasks and compose services.
export function useStackDetect(root: string): UseStackDetectResult {
  const { data, isFetching, error, refetch } = useQuery({
    queryKey: ['stack-detect', root],
    queryFn: () =>
      getJson<DetectedService[]>(
        `/api/repos/detect?root=${encodeURIComponent(root)}`,
      ),
    enabled: false,
    retry: false,
  })
  return useMemo(
    () => ({
      detected: data ?? null,
      isDetecting: isFetching,
      error,
      detect: () => void refetch(),
    }),
    [data, isFetching, error, refetch],
  )
}
