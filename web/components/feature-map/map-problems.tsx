import type { FeatureMapOverview } from '../../../core/types.ts'

interface MapProblemsProps {
  problems: FeatureMapOverview['problems']
}

// The map and blocks files that didn't parse. The page works with the rest.
export function MapProblems({ problems }: MapProblemsProps) {
  if (problems.length === 0) return null
  return (
    <div role="status" className="flex flex-col gap-1 text-xs text-warning">
      <p className="font-semibold">Couldn't read</p>
      <ul className="flex flex-col gap-0.5">
        {problems.map(({ file, problem }) => (
          <li key={file} className="break-words">
            {file}: {problem}
          </li>
        ))}
      </ul>
    </div>
  )
}
