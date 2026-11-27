import {
  Bot,
  CalendarClock,
  FolderGit2,
  GitPullRequest,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Terminal,
} from 'lucide-react'
import type { ReactElement, RefObject } from 'react'
import { NavLink } from 'react-router'

import { ThemePicker } from '@/components/settings/theme-picker.tsx'
import { Beaver } from '@/components/terminals/beaver.tsx'
import { Button } from '@/components/ui/button.tsx'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover.tsx'
import { Tip } from '@/components/ui/tooltip.tsx'
import { useTerminalPanel } from '@/contexts/terminal-context.ts'
import { useTheme } from '@/contexts/theme-context.ts'
import { useSidebarState } from '@/hooks/use-sidebar-state.ts'
import { THEMES, themeIcon } from '@/lib/theme.ts'
import { cn } from '@/lib/utils.ts'

const LINKS = [
  { to: '/', label: 'Worktrees', icon: FolderGit2, end: true },
  { to: '/agents', label: 'Agents', icon: Bot, end: false },
  { to: '/schedules', label: 'Schedules', icon: CalendarClock, end: false },
  { to: '/github', label: 'GitHub', icon: GitPullRequest, end: false },
  { to: '/settings', label: 'Settings', icon: Settings, end: false },
] as const

interface SidebarProps {
  logoRef: RefObject<HTMLImageElement | null> // where the intro's beaver lands
  hideLogo: boolean // while the intro's beaver is still on its way
}

interface RailTipProps {
  collapsed: boolean
  label: string
  children: ReactElement
}

// A collapsed sidebar shows icons only, so each says what it is on hover and focus.
function RailTip({ collapsed, label, children }: RailTipProps) {
  if (!collapsed) return children
  return (
    <Tip label={label} side="right">
      {children}
    </Tip>
  )
}

// The pages, the Terminal and the theme. Collapsed, it's a rail of their icons on a wide screen;
// a narrow one always shows the bar across the top.
export function Sidebar({ logoRef, hideLogo }: SidebarProps) {
  const { theme } = useTheme()
  const { collapsed, toggle } = useSidebarState()
  // Out of sight only on a wide screen, where the rail is; still read out.
  const label = cn(collapsed && 'md:sr-only')
  return (
    <nav
      aria-label="Pages"
      className={cn(
        'flex flex-col gap-5 border-b bg-sidebar p-3 md:sticky md:top-0 md:h-dvh md:shrink-0 md:overflow-x-hidden md:border-r md:border-b-0 md:motion-safe:transition-[width]',
        collapsed ? 'md:w-14 md:px-2' : 'md:w-56',
      )}
    >
      <div
        className={cn(
          'flex items-center gap-2 px-2 pt-1',
          collapsed && 'md:justify-center md:px-0',
        )}
      >
        <img
          ref={logoRef}
          src={themeIcon(theme)}
          alt=""
          className={cn('size-7 shrink-0 rounded-md', hideLogo && 'invisible')}
        />
        <span
          className={cn(
            'text-sm font-semibold whitespace-nowrap text-strong',
            label,
          )}
        >
          Stack monitor
        </span>
      </div>
      <ul className="-mx-1 flex gap-0.5 overflow-x-auto px-1 md:mx-0 md:flex-col md:overflow-visible md:px-0">
        {LINKS.map(({ to, label: text, icon: Icon, end }) => (
          <li key={to}>
            <RailTip collapsed={collapsed} label={text}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted hover:text-strong',
                    isActive && 'bg-muted text-strong',
                    collapsed && 'md:justify-center md:px-0',
                  )
                }
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                <span className={label}>{text}</span>
              </NavLink>
            </RailTip>
          </li>
        ))}
        <li>
          <RailTip collapsed={collapsed} label="Terminal">
            <TerminalButton collapsed={collapsed} />
          </RailTip>
        </li>
      </ul>
      <div
        className={cn(
          'mt-auto hidden gap-1 md:flex',
          collapsed ? 'flex-col items-center' : 'items-center',
        )}
      >
        <ThemeButton collapsed={collapsed} />
        <Tip
          label={
            collapsed ? 'Expand the sidebar (⌘B)' : 'Collapse the sidebar (⌘B)'
          }
          side="right"
        >
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={
              collapsed ? 'Expand the sidebar' : 'Collapse the sidebar'
            }
            onClick={() => toggle()}
            className="shrink-0 text-muted-foreground"
          >
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </Button>
        </Tip>
      </div>
    </nav>
  )
}

interface TerminalButtonProps {
  collapsed: boolean
}

// Not a page: it shows or hides the Terminal panel beside whichever page is open. The rest of its
// props come from a tooltip that wraps it.
function TerminalButton({ collapsed, ...trigger }: TerminalButtonProps) {
  const { sessions, shown, setShown, busy } = useTerminalPanel()
  const running = sessions.filter((session) => session.exitCode === null).length
  return (
    <button
      {...trigger}
      type="button"
      aria-pressed={shown}
      onClick={() => setShown(!shown)}
      className={cn(
        'relative flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-strong focus-visible:ring-2 focus-visible:ring-ring',
        shown && 'bg-muted text-strong',
        collapsed && 'md:justify-center md:px-0',
      )}
    >
      {busy.size > 0 ? (
        <Beaver busy />
      ) : (
        <Terminal className="size-4 shrink-0" aria-hidden="true" />
      )}
      <span className={cn(collapsed && 'md:sr-only')}>Terminal</span>
      {running > 0 && (
        <span
          className={cn(
            'ml-auto rounded-full bg-success/15 px-1.5 text-xs text-success tabular-nums',
            collapsed &&
              'md:absolute md:top-0 md:right-0 md:ml-0 md:px-1 md:text-[10px] md:leading-4',
          )}
        >
          {running}
          <span className="sr-only"> running</span>
        </span>
      )}
    </button>
  )
}

interface ThemeButtonProps {
  collapsed: boolean
}

// The theme as its three colours; the full picker opens above it.
function ThemeButton({ collapsed }: ThemeButtonProps) {
  const { theme } = useTheme()
  const current = THEMES.find((option) => option.id === theme) ?? THEMES[0]
  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          'flex min-w-0 items-center gap-2 rounded-md px-2.5 py-1.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-strong focus-visible:ring-2 focus-visible:ring-ring',
          collapsed ? 'justify-center px-1.5' : 'flex-1',
        )}
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
        {!collapsed && current.label}
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-64">
        <ThemePicker />
      </PopoverContent>
    </Popover>
  )
}
