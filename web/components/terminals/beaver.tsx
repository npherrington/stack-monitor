import { useTheme } from '@/contexts/theme-context.ts'
import { themeIcon } from '@/lib/theme.ts'
import { cn } from '@/lib/utils.ts'

interface BeaverProps {
  busy: boolean // Claude is working: it spins
  className?: string
}

// The theme's beaver, standing in for a Claude Code session.
export function Beaver({ busy, className }: BeaverProps) {
  const { theme } = useTheme()
  return (
    <img
      src={themeIcon(theme)}
      alt=""
      width={16}
      height={16}
      className={cn(
        'size-4 shrink-0 rounded-[3px]',
        busy && 'motion-safe:animate-spin',
        className,
      )}
    />
  )
}
