import { ExternalLink } from 'lucide-react'
import { useEffect, useRef } from 'react'

import { Skeleton } from '@/components/ui/skeleton.tsx'
import { useJobLog } from '@/hooks/use-job-log.ts'
import { cn } from '@/lib/utils.ts'

interface CheckLogProps {
  root: string
  job: number
  url: string | null // the job on GitHub, for the whole log
}

// A failed job's failing step, scrolled to its end, where the error is.
export function CheckLog({ root, job, url }: CheckLogProps) {
  const { log, isPending, error } = useJobLog(root, job)
  const pre = useRef<HTMLPreElement>(null)
  // Once per log read, not on each render, so a poll elsewhere doesn't move it while it's read.
  useEffect(() => {
    if (log !== null && pre.current !== null) {
      pre.current.scrollTop = pre.current.scrollHeight
    }
  }, [log])

  const onGithub = url !== null && (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 font-semibold underline"
    >
      the whole log on GitHub <ExternalLink className="size-3" />
    </a>
  )

  if (isPending) return <Skeleton className="h-40" />
  if (log === null) {
    return (
      <p className="text-xs whitespace-pre-wrap text-destructive" role="alert">
        {error?.message ?? "Couldn't read the log"}
        {onGithub !== false && <> Open {onGithub}.</>}
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs text-muted-foreground">
        {!log.failed ? (
          <>The log has no error line; its last lines follow.</>
        ) : log.step === null ? (
          <>Failed before its first step ran.</>
        ) : (
          <>
            Failed in{' '}
            <span className="font-mono text-foreground">{log.step}</span>.
          </>
        )}
        {log.cut && onGithub !== false && (
          <> Earlier lines are in {onGithub}.</>
        )}
      </p>
      <pre
        ref={pre}
        className="max-h-96 overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-xs leading-relaxed"
      >
        {log.lines.length === 0 && (
          <span className="text-muted-foreground">The log is empty.</span>
        )}
        {log.lines.map((line) => (
          <div
            key={line.number}
            className={cn(line.error && 'font-semibold text-destructive')}
          >
            {line.text === '' ? ' ' : line.text}
          </div>
        ))}
      </pre>
    </div>
  )
}
