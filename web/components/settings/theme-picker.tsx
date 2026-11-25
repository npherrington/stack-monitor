import { useTheme } from '@/contexts/theme-context.ts'
import { THEMES } from '@/lib/theme.ts'
import { cn } from '@/lib/utils.ts'

// Every variety as a swatch, not a dropdown: each shows its own colours whichever is active.
export function ThemePicker() {
  const { theme, setTheme } = useTheme()
  return (
    <div role="group" aria-label="Theme" className="grid grid-cols-3 gap-2">
      {THEMES.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={option.id === theme}
          title={`${option.label}: ${option.colours}`}
          onClick={() => setTheme(option.id)}
          className={cn(
            'group flex flex-col items-center gap-1.5 rounded-xl p-2 text-[11px] font-semibold text-muted-foreground transition outline-none hover:bg-card focus-visible:ring-2 focus-visible:ring-ring',
            'aria-pressed:bg-card aria-pressed:text-strong aria-pressed:shadow-sm',
          )}
        >
          <span className="flex -space-x-1.5" aria-hidden="true">
            {option.preview.map((colour) => (
              // The preview shows another variety's colours, which no token of the active one holds.
              <span
                key={colour}
                className="size-4 rounded-full border-2 border-white"
                style={{ backgroundColor: colour }}
              />
            ))}
          </span>
          {option.label}
        </button>
      ))}
    </div>
  )
}
