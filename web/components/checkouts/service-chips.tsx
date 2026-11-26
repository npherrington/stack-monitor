import { Layers } from 'lucide-react'

import type { ServiceState } from '../../../core/types.ts'
import { Tip } from '@/components/ui/tooltip.tsx'
import { cn } from '@/lib/utils.ts'

interface ServiceChipsProps {
  services: ServiceState[]
}

const STATE_WORDS = {
  up: 'up',
  partial: 'partly up',
  down: 'down',
  unknown: "can't tell",
} as const

// A checkout's stack as one icon and how many services are up; each service's state on hover.
export function ServiceChips({ services }: ServiceChipsProps) {
  const up = services.filter((service) => service.state === 'up').length
  const tone =
    up === services.length
      ? 'text-success'
      : up > 0 || services.some((service) => service.state === 'partial')
        ? 'text-warning'
        : 'text-muted-foreground'
  const summary = `Stack: ${up} of ${services.length} up`
  return (
    <Tip
      label={
        <span className="flex flex-col">
          <span className="font-semibold">{summary}</span>
          {services.map((service) => (
            <span key={service.name}>
              {service.name}: {STATE_WORDS[service.state]}
              {service.detail !== null && ` (${service.detail})`}
            </span>
          ))}
        </span>
      }
    >
      <span
        className={cn(
          'inline-flex items-center gap-1 text-xs font-medium tabular-nums',
          tone,
        )}
      >
        <Layers className="size-3.5" aria-hidden="true" />
        <span aria-hidden="true">
          {up}/{services.length}
        </span>
        <span className="sr-only">{summary}</span>
      </span>
    </Tip>
  )
}
