import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import type { JobLog } from '../../core/types.ts'
import { getJson } from '@/lib/api.ts'
import { githubKey } from '@/hooks/use-pulls.ts'

interface UseJobLogResult {
  log: JobLog | null
  isPending: boolean
  error: Error | null
}

// A failed Actions job's failing step, read when the component asking for it mounts. A finished
// job's log can't change and a re-run makes new job ids, so it's read once and kept until the
// page reloads, folded or not: no interval, no refetch on focus.
export function useJobLog(root: string, job: number): UseJobLogResult {
  const { data, isPending, error } = useQuery({
    queryKey: [...githubKey, 'job-log', root, job],
    queryFn: () =>
      getJson<JobLog>(
        `/api/github/checks/log?root=${encodeURIComponent(root)}&job=${job}`,
      ),
    staleTime: Infinity,
    gcTime: Infinity,
  })
  return useMemo(
    () => ({ log: data ?? null, isPending, error }),
    [data, isPending, error],
  )
}
