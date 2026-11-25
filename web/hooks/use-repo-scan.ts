import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import type { ScanResult } from '../../core/types.ts'
import { getJson } from '@/lib/api.ts'

interface UseRepoScanResult {
  result: ScanResult | null
  isScanning: boolean
  error: Error | null
}

// Runs once per folder asked for (null: not yet), and again only when asked again.
export function useRepoScan(folder: string | null): UseRepoScanResult {
  const { data, isFetching, error } = useQuery({
    queryKey: ['repo-scan', folder],
    queryFn: () =>
      getJson<ScanResult>(
        `/api/repos/scan?folder=${encodeURIComponent(folder ?? '')}`,
      ),
    enabled: folder !== null,
    staleTime: Infinity,
    retry: false,
  })
  return useMemo(
    () => ({ result: data ?? null, isScanning: isFetching, error }),
    [data, isFetching, error],
  )
}
