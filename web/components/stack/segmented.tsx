import { cn } from '@/lib/utils.ts'

interface SegmentedProps<T extends string> {
  label: string
  options: readonly { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}

// A row of choices, every one visible: the page's stand-in for a select with a few options.
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: SegmentedProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex flex-wrap gap-1 rounded-full bg-secondary p-1"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={cn(
            'h-7 rounded-full px-3 text-xs font-semibold text-muted-foreground transition outline-none hover:text-strong focus-visible:ring-2 focus-visible:ring-ring',
            'aria-pressed:bg-card aria-pressed:text-strong aria-pressed:shadow-sm',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
