import {
  Bot,
  CalendarClock,
  FolderGit2,
  GitPullRequest,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
} from 'lucide-react'
import type { ReactElement, RefObject } from 'react'
import { NavLink } from 'react-router'

import { ThemePicker } from '@/components/settings/theme-picker.tsx'
import { SessionList } from '@/components/terminals/session-list.tsx'
import { Button } from '@/components/ui/button.tsx'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover.tsx'
import { Separator } from '@/components/ui/separator.tsx'
import { Tip } from '@/components/ui/tooltip.tsx'
import { useTerminalLayout } from '@/contexts/terminal-context.ts'
import { useTheme } from '@/contexts/theme-context.ts'
import { useSidebarState } from '@/hooks/use-sidebar-state.ts'
import { THEMES, themeIcon } from '@/lib/theme.ts'
import { cn } from '@/lib/utils.ts'

const GROUPS = [
  {
    heading: 'Work',
    links: [
      { to: '/', label: 'Worktrees', icon: FolderGit2, end: true },
      { to: '/github', label: 'GitHub', icon: GitPullRequest, end: false },
    ],
  },
  {
    heading: 'Automation',
    links: [
      { to: '/agents', label: 'Agents', icon: Bot, end: false },
      { to: '/schedules', label: 'Schedules', icon: CalendarClock, end: false },
    ],
  },
] as const

const SETTINGS = {
  to: '/settings',
  label: 'Settings',
  icon: Settings,
  end: false,
} as const

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

// The pages in their groups, the terminal sessions, then Settings and the theme at the foot.
// Collapsed, it's a rail of their icons on a wide screen; a narrow one always shows the bar across
// the top.
export function Sidebar({ logoRef, hideLogo }: SidebarProps) {
  const { theme } = useTheme()
  const { collapsed, toggle } = useSidebarState()
  // Out of sight only on a wide screen, where the rail is; still read out.
  const label = cn(collapsed && 'md:sr-only')
  return (
    <nav
      aria-label="Pages"
      className={cn(
        'flex flex-col gap-3 border-b bg-sidebar p-3 md:h-dvh md:shrink-0 md:gap-5 md:overflow-x-hidden md:border-r md:border-b-0 md:motion-safe:transition-[width]',
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
      <div className="-mx-1 flex min-h-0 items-center gap-0.5 overflow-x-auto px-1 md:mx-0 md:flex-1 md:flex-col md:items-stretch md:gap-5 md:overflow-x-hidden md:overflow-y-auto md:px-0">
        {GROUPS.map(({ heading, links }, at) => (
          <section
            key={heading}
            aria-label={heading}
            className="flex md:flex-col md:gap-1"
          >
            <h2
              aria-hidden="true"
              className={cn(
                'hidden px-2.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase md:block',
                collapsed && 'md:hidden',
              )}
            >
              {heading}
            </h2>
            {collapsed && at > 0 && (
              <Separator className="mb-1 hidden md:block" />
            )}
            <ul className="flex gap-0.5 md:flex-col">
              {links.map((link) => (
                <li key={link.to}>
                  <PageLink link={link} collapsed={collapsed} />
                </li>
              ))}
            </ul>
          </section>
        ))}
        <div className="md:hidden">
          <PageLink link={SETTINGS} collapsed={collapsed} />
        </div>
        <SessionList collapsed={collapsed} />
      </div>
      <div
        className={cn(
          'hidden md:block',
          collapsed && 'md:flex md:justify-center',
        )}
      >
        <PageLink link={SETTINGS} collapsed={collapsed} />
      </div>
      <div
        className={cn(
          'hidden gap-1 md:flex',
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

interface PageLinkProps {
  link: {
    to: string
    label: string
    icon: typeof Settings
    end: boolean
  }
  collapsed: boolean
}

// A page in the sidebar. Following it also brings the page back if a pane menu hid it.
function PageLink({ link, collapsed }: PageLinkProps) {
  const { setHidden } = useTerminalLayout()
  const { to, label: text, icon: Icon, end } = link
  return (
    <RailTip collapsed={collapsed} label={text}>
      <NavLink
        to={to}
        end={end}
        onClick={() => setHidden('page', false)}
        className={({ isActive }) =>
          cn(
            'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted hover:text-strong',
            isActive && 'bg-muted text-strong',
            collapsed && 'md:justify-center md:px-0',
          )
        }
      >
        <Icon className="size-4 shrink-0" aria-hidden="true" />
        <span className={cn(collapsed && 'md:sr-only')}>{text}</span>
      </NavLink>
    </RailTip>
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
