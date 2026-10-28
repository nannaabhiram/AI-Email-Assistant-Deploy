import {
  BarChart3, CalendarDays, CheckSquare, FileText, Inbox, LayoutDashboard, Paperclip, PenLine, Search, Settings, ShieldCheck, SlidersHorizontal, Users,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { NavLink } from 'react-router'
import { cn } from '@/lib/cn'

export interface NavItem {
  to: string
  label: string
  icon: ReactNode
  badge?: number
}

export const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Mail',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" aria-hidden /> },
      { to: '/inbox', label: 'Priority inbox', icon: <Inbox className="h-4 w-4" aria-hidden /> },
      { to: '/search', label: 'Search', icon: <Search className="h-4 w-4" aria-hidden /> },
      { to: '/briefings', label: 'Daily briefings', icon: <CalendarDays className="h-4 w-4" aria-hidden /> },
    ],
  },
  {
    label: 'Work',
    items: [
      { to: '/tasks', label: 'Tasks & commitments', icon: <CheckSquare className="h-4 w-4" aria-hidden /> },
      { to: '/drafts', label: 'Reply drafts', icon: <PenLine className="h-4 w-4" aria-hidden /> },
      { to: '/approvals', label: 'Approvals', icon: <ShieldCheck className="h-4 w-4" aria-hidden /> },
      { to: '/attachments', label: 'Attachments', icon: <Paperclip className="h-4 w-4" aria-hidden /> },
      { to: '/organize', label: 'Organize & digests', icon: <FileText className="h-4 w-4" aria-hidden /> },
    ],
  },
  {
    label: 'Insights',
    items: [
      { to: '/contacts', label: 'Contacts & VIPs', icon: <Users className="h-4 w-4" aria-hidden /> },
      { to: '/analytics', label: 'Analytics', icon: <BarChart3 className="h-4 w-4" aria-hidden /> },
    ],
  },
  {
    label: 'Settings',
    items: [
      { to: '/settings/accounts', label: 'Security & accounts', icon: <Settings className="h-4 w-4" aria-hidden /> },
      { to: '/settings/preferences', label: 'Preferences', icon: <SlidersHorizontal className="h-4 w-4" aria-hidden /> },
    ],
  },
]

export interface NavigationSidebarProps {
  badges?: Record<string, number>
  onNavigate?: () => void
  className?: string
}

export function NavigationSidebar({ badges = {}, onNavigate, className }: NavigationSidebarProps) {
  return (
    <nav aria-label="Main" className={cn('flex h-full flex-col gap-5 overflow-y-auto px-3 py-4', className)}>
      <div className="flex items-center gap-2 px-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-fg" aria-hidden>MP</span>
        <span className="text-base font-semibold text-fg">MailPilot AI</span>
      </div>
      {NAV_SECTIONS.map((section) => (
        <div key={section.label}>
          <p className="mb-1 px-2 text-xs font-semibold tracking-wide text-fg-subtle uppercase">{section.label}</p>
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const badge = badges[item.to]
              return (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    onClick={onNavigate}
                    className={({ isActive }) => cn(
                      'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors',
                      isActive ? 'bg-primary-soft font-medium text-primary' : 'text-fg-muted hover:bg-surface-muted hover:text-fg',
                    )}
                  >
                    {item.icon}
                    <span className="flex-1">{item.label}</span>
                    {badge ? <span className="rounded-full bg-warning-soft px-1.5 text-xs font-semibold text-warning" aria-label={`${badge} pending`}>{badge}</span> : null}
                  </NavLink>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}
