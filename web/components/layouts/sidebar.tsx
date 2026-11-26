import { Bot, CalendarClock, FolderGit2, Settings } from 'lucide-react'
import type { RefObject } from 'react'
import { NavLink } from 'react-router'

import { ThemePicker } from '@/components/settings/theme-picker.tsx'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover.tsx'
import { useTheme } from '@/contexts/theme-context.ts'
import { THEMES, themeIcon } from '@/lib/theme.ts'
import { cn } from '@/lib/utils.ts'

const LINKS = [
  { to: '/', label: 'Worktrees', icon: FolderGit2, end: true },
  { to: '/agents', label: 'Agents', icon: Bot, end: false },
  { to: '/schedules', label: 'Schedules', icon: CalendarClock, end: false },
  { to: '/settings', label: 'Settings', icon: Settings, end: false },
] as const

interface SidebarProps {
  logoRef: RefObject<HTMLImageElement | null> // where the intro's beaver lands
  hideLogo: boolean // while the intro's beaver is still on its way
}

export function Sidebar({ logoRef, hideLogo }: SidebarProps) {
  const { theme } = useTheme()
  return (
    <nav
      aria-label="Pages"
      className="flex flex-col gap-5 border-b bg-sidebar p-3 md:sticky md:top-0 md:h-dvh md:w-56 md:shrink-0 md:border-r md:border-b-0"
    >
      <div className="flex items-center gap-2 px-2 pt-1">
        <img
          ref={logoRef}
          src={themeIcon(theme)}
          alt=""
          className={cn('size-7 rounded-md', hideLogo && 'invisible')}
        />
        <span className="text-sm font-semibold text-strong">Stack monitor</span>
      </div>
      <ul className="-mx-1 flex gap-0.5 overflow-x-auto px-1 md:mx-0 md:flex-col md:overflow-visible md:px-0">
        {LINKS.map(({ to, label, icon: Icon, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted hover:text-strong',
                  isActive && 'bg-muted text-strong',
                )
              }
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
      <ThemeButton />
    </nav>
  )
}

// The theme as its three colours; the full picker opens above it.
function ThemeButton() {
  const { theme } = useTheme()
  const current = THEMES.find((option) => option.id === theme) ?? THEMES[0]
  return (
    <Popover>
      <PopoverTrigger
        className="mt-auto hidden items-center gap-2 rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-strong focus-visible:ring-2 focus-visible:ring-ring md:flex"
        aria-label={`Theme: ${current.label}`}
      >
        <span className="flex -space-x-1" aria-hidden="true">
          {current.preview.map((colour) => (
            <span
              key={colour}
              className="size-3 rounded-full ring-2 ring-sidebar"
              style={{ backgroundColor: colour }}
            />
          ))}
        </span>
        {current.label}
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-64">
        <ThemePicker />
      </PopoverContent>
    </Popover>
  )
}
