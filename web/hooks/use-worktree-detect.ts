import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import type { DetectedWorktreeCommand } from '../../core/types.ts'
import { getJson } from '@/lib/api.ts'

interface UseWorktreeDetectResult {
  detected: DetectedWorktreeCommand[] | null // null until asked
  isDetecting: boolean
  error: Error | null
  detect: () => void
}

// Commands the repo's files suggest for making, setting up and removing worktrees, read when asked.
export function useWorktreeDetect(root: string): UseWorktreeDetectResult {
  const { data, isFetching, error, refetch } = useQuery({
    queryKey: ['worktree-detect', root],
    queryFn: () =>
      getJson<DetectedWorktreeCommand[]>(
        `/api/repos/detect-worktrees?root=${encodeURIComponent(root)}`,
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
