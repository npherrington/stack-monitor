import { Sparkles } from 'lucide-react'

import type { DetectedService } from '../../../core/types.ts'
import { Button } from '@/components/ui/button.tsx'
import { Pill } from '@/components/ui/pill.tsx'
import { useStackDetect } from '@/hooks/use-stack-detect.ts'

interface DetectPanelProps {
  root: string
  takenNames: string[]
  onAdd: (detected: DetectedService) => void
}

// Services the repo's package.json, mise tasks, compose file and Procfile suggest, to add one at a
// time and then check.
export function DetectPanel({ root, takenNames, onAdd }: DetectPanelProps) {
  const { detected, isDetecting, error, detect } = useStackDetect(root)
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-dashed bg-card/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Read the repo’s package.json, mise tasks, compose file and Procfile
          for services to add.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={detect}
          disabled={isDetecting}
        >
          <Sparkles />
          {isDetecting
            ? 'Looking…'
            : detected === null
              ? 'Detect'
              : 'Detect again'}
        </Button>
      </div>
      {error !== null && (
        <p className="text-sm text-destructive" role="alert">
          {error.message}
        </p>
      )}
      {detected !== null && detected.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nothing found to suggest.
        </p>
      )}
      {detected !== null && detected.length > 0 && (
        <ul className="flex flex-col divide-y rounded-xl border bg-card">
          {detected.map((suggestion) => {
            const taken = takenNames.includes(suggestion.name)
            return (
              <li
                key={`${suggestion.from}:${suggestion.name}`}
                className="flex items-start gap-3 px-4 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold text-strong">
                    {suggestion.name}
                    <Pill>{suggestion.from}</Pill>
                  </p>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {suggestion.service.start}
                  </p>
                  {suggestion.note !== null && (
                    <p className="text-xs text-warning">{suggestion.note}</p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant={taken ? 'ghost' : 'secondary'}
                  disabled={taken}
                  onClick={() => onAdd(suggestion)}
                >
                  {taken ? 'Added' : 'Add'}
                </Button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
