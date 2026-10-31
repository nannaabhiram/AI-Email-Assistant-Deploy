import { CheckSquare, Inbox, LayoutDashboard, Menu, ShieldCheck } from 'lucide-react'
import { NavLink } from 'react-router'
import { cn } from '@/lib/cn'

const TABS = [
  { to: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { to: '/inbox', label: 'Inbox', icon: Inbox },
  { to: '/tasks', label: 'Tasks', icon: CheckSquare },
  { to: '/approvals', label: 'Approvals', icon: ShieldCheck },
] as const

export interface MobileTabBarProps {
  approvals?: number
  onMore: () => void
  className?: string
}

/** iOS-style floating glass tab bar for phones and tablets. */
export function MobileTabBar({ approvals = 0, onMore, className }: MobileTabBarProps) {
  return (
    <nav aria-label="Quick navigation" className={cn('mp-tabbar mp-glass-bar lg:hidden', className)}>
      {TABS.map(({ to, label, icon: Icon }) => (
        <NavLink key={to} to={to} className="mp-tabbar__item">
          <Icon className="h-5 w-5" aria-hidden />
          <span>{label}</span>
          {to === '/approvals' && approvals > 0 && (
            <span className="mp-tabbar__badge" aria-label={`${approvals} pending`}>{approvals > 9 ? '9+' : approvals}</span>
          )}
        </NavLink>
      ))}
      <button type="button" className="mp-tabbar__item" onClick={onMore} aria-haspopup="dialog">
        <Menu className="h-5 w-5" aria-hidden />
        <span>More</span>
      </button>
    </nav>
  )
}
