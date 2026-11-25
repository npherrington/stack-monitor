import type { ServiceState } from '../../../core/types.ts'
import { StatusDot } from '@/components/ui/status-dot.tsx'

interface ServiceChipsProps {
  services: ServiceState[]
}

const STATE_WORDS = {
  up: 'up',
  partial: 'partly up',
  down: 'down',
  unknown: "can't tell",
} as const

// A checkout's stack: each service with whether it's up here, the detail on hover.
export function ServiceChips({ services }: ServiceChipsProps) {
  const up = services.filter((service) => service.state === 'up').length
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-bold text-muted-foreground">
        Stack · {up} of {services.length} up
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {services.map((service) => (
          <li
            key={service.name}
            title={
              service.detail === null
                ? STATE_WORDS[service.state]
                : `${STATE_WORDS[service.state]}: ${service.detail}`
            }
            className="inline-flex h-7 items-center gap-1.5 rounded-full border bg-card px-2.5 text-xs font-semibold text-strong"
          >
            <StatusDot state={service.state} />
            {service.name}
            <span className="sr-only">{STATE_WORDS[service.state]}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
