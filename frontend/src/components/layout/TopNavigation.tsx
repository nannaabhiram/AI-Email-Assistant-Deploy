import { Bell, LogOut, Menu, User } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DropdownMenu } from '@/components/ui/DropdownMenu'
import { IconButton } from '@/components/ui/IconButton'
import { SearchInput } from '@/components/ui/SearchInput'
import { ThemeToggle } from '@/components/ui/ThemeToggle'

export interface TopNavigationProps {
  userEmail?: string | null
  unreadNotifications?: number
  onSearch?: (q: string) => void
  onOpenMenu?: () => void
  onOpenNotifications?: () => void
  onProfile?: () => void
  onSignOut?: () => void
}

export function TopNavigation({ userEmail, unreadNotifications = 0, onSearch, onOpenMenu, onOpenNotifications, onProfile, onSignOut }: TopNavigationProps) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface/95 px-4 backdrop-blur">
      {onOpenMenu && <IconButton className="lg:hidden" label="Open navigation" icon={<Menu className="h-5 w-5" aria-hidden />} onClick={onOpenMenu} showTooltip={false} />}
      {onSearch && <SearchInput className="max-w-xl" label="Search mail" placeholder="Ask: “emails needing a reply today”" onSubmit={(q) => q && onSearch(q)} />}
      <div className="ml-auto flex items-center gap-2">
        <ThemeToggle className="hidden sm:inline-flex" />
        {onOpenNotifications && (
          <span className="relative">
            <IconButton label={`Notifications${unreadNotifications ? `, ${unreadNotifications} unread` : ''}`} icon={<Bell className="h-5 w-5" aria-hidden />} onClick={onOpenNotifications} />
            {unreadNotifications > 0 && (
              <span className="pointer-events-none absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-danger px-1 text-center text-[10px] leading-4 font-bold text-white" aria-hidden>
                {unreadNotifications > 9 ? '9+' : unreadNotifications}
              </span>
            )}
          </span>
        )}
        <DropdownMenu
          label="Account"
          items={[
            ...(onProfile ? [{ label: 'Account & security', onSelect: onProfile, icon: <User className="h-4 w-4" aria-hidden /> }] : []),
            ...(onSignOut ? [{ label: 'Sign out', onSelect: onSignOut, icon: <LogOut className="h-4 w-4" aria-hidden />, destructive: true }] : []),
          ]}
          trigger={(props) => (
            <Button variant="ghost" size="sm" {...props} className="max-w-48">
              <User className="h-4 w-4 shrink-0" aria-hidden />
              <span className="hidden truncate md:inline">{userEmail ?? 'Account'}</span>
              <span className="sr-only md:hidden">Account menu</span>
            </Button>
          )}
        />
      </div>
    </header>
  )
}
