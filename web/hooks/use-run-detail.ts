import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import type { RunDetail } from '../../core/types.ts'
import { getJson } from '@/lib/api.ts'

interface UseRunDetailResult {
  detail: RunDetail | null
  isPending: boolean
  error: Error | null
}

// One run's events, re-read every second and a half while it goes and not after.
export function useRunDetail(id: string | null): UseRunDetailResult {
  const { data, isPending, error } = useQuery({
    queryKey: ['run', id],
    queryFn: () =>
      getJson<RunDetail>(`/api/runs/detail?id=${encodeURIComponent(id ?? '')}`),
    enabled: id !== null,
    refetchInterval: (query) =>
      query.state.data?.run.state === 'running' ? 1_500 : false,
  })
  return useMemo(
    () => ({ detail: data ?? null, isPending, error }),
    [data, isPending, error],
  )
}
