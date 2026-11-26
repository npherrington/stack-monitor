import { useTheme } from '@/contexts/theme-context.ts'
import { THEMES } from '@/lib/theme.ts'
import { cn } from '@/lib/utils.ts'

const GROUPS = [
  { mode: 'light', label: 'Light' },
  { mode: 'dark', label: 'Dark' },
] as const

// Every variety as a swatch, not a dropdown: each shows its own colours whichever is active.
export function ThemePicker() {
  const { theme, setTheme } = useTheme()
  return (
    <div className="flex flex-col gap-3">
      {GROUPS.map((group) => (
        <div
          key={group.mode}
          role="group"
          aria-label={`${group.label} themes`}
          className="flex flex-col gap-1"
        >
          <span className="px-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            {group.label}
          </span>
          <div className="grid grid-cols-3 gap-1">
            {THEMES.filter((option) => option.mode === group.mode).map(
              (option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={option.id === theme}
                  title={`${option.label}: ${option.colours}`}
                  onClick={() => setTheme(option.id)}
                  className={cn(
                    'group flex flex-col items-center gap-1.5 rounded-md p-2 text-[11px] font-semibold text-muted-foreground transition outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring',
                    'aria-pressed:bg-muted aria-pressed:text-strong aria-pressed:shadow-sm',
                  )}
                >
                  <span className="flex -space-x-1.5" aria-hidden="true">
                    {option.preview.map((colour) => (
                      // The preview shows another variety's colours, which no token of the active one holds.
                      <span
                        key={colour}
                        className="size-4 rounded-full border-2 border-popover shadow-[inset_0_0_0_1px_rgb(128_128_128/0.4)]"
                        style={{ backgroundColor: colour }}
                      />
                    ))}
                  </span>
                  {option.label}
                </button>
              ),
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
