import { FolderGit2, Settings } from 'lucide-react'
import { NavLink } from 'react-router'

import { ThemePicker } from '@/components/settings/theme-picker.tsx'
import { useTheme } from '@/contexts/theme-context.ts'
import { themeIcon } from '@/lib/theme.ts'
import { cn } from '@/lib/utils.ts'

const LINKS = [
  { to: '/', label: 'Checkouts', icon: FolderGit2, end: true },
  { to: '/settings', label: 'Settings', icon: Settings, end: false },
] as const

export function Sidebar() {
  const { theme } = useTheme()
  return (
    <nav
      aria-label="Pages"
      className="flex flex-col gap-6 border-b bg-sidebar p-4 backdrop-blur md:sticky md:top-0 md:h-dvh md:w-60 md:shrink-0 md:border-r md:border-b-0"
    >
      <div className="flex items-center gap-2.5 px-2">
        <img src={themeIcon(theme)} alt="" className="size-8 rounded-lg" />
        <span className="bg-linear-to-r from-strong to-muted-foreground bg-clip-text text-lg font-extrabold text-transparent">
          Stack monitor
        </span>
      </div>
      <ul className="flex gap-1 md:flex-col">
        {LINKS.map(({ to, label, icon: Icon, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-muted-foreground transition hover:bg-card hover:text-strong',
                  isActive && 'bg-card text-strong shadow-sm',
                )
              }
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
      <section
        className="mt-auto hidden md:block"
        aria-labelledby="theme-title"
      >
        <h2
          id="theme-title"
          className="mb-2 px-2 text-xs font-bold text-muted-foreground"
        >
          Theme
        </h2>
        <ThemePicker />
      </section>
    </nav>
  )
}
