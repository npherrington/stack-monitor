import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import type { SkillInfo } from '../../core/types.ts'
import { getJson } from '@/lib/api.ts'

// A repo's skills, read from its .agents/skills and .claude/skills. A draft run writing a new one
// shows on the next refetch, so this refetches while the tab is in view.
export function useSkills(root: string | null): {
  skills: SkillInfo[]
  isPending: boolean
  error: Error | null
} {
  const { data, isPending, error } = useQuery({
    queryKey: ['skills', root],
    queryFn: () =>
      getJson<SkillInfo[]>(
        `/api/skills?root=${encodeURIComponent(root ?? '')}`,
      ),
    enabled: root !== null,
    refetchInterval: 10_000,
  })
  return useMemo(
    () => ({
      skills: data ?? [],
      isPending: root !== null && isPending,
      error,
    }),
    [data, isPending, error, root],
  )
}
