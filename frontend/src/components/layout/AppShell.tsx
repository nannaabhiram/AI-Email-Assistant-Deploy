import { CloudOff, FlaskConical, ServerCrash, WifiOff, X } from 'lucide-react'
import { useState } from 'react'
import { Link, Outlet, useNavigate } from 'react-router'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { EmptyState } from '@/components/ui/States'
import { useAuth } from '@/hooks/useAuth'
import { keys, useAction, useApprovals, useMe, useNotifications, useOnline, useSystemStatus } from '@/hooks/queries'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { relativeTime } from '@/lib/format'
import { inferenceState } from '@/lib/types'
import { NavigationSidebar } from './NavigationSidebar'
import { TopNavigation } from './TopNavigation'

function Banner({ tone, icon, children }: { tone: 'warning' | 'danger'; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div role="status" className={cn('flex items-center gap-2 px-4 py-2 text-sm', tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning')}>
      {icon}<span>{children}</span>
    </div>
  )
}

export function AppShell() {
  const { session, signOut } = useAuth()
  const navigate = useNavigate()
  const online = useOnline()
  const [drawer, setDrawer] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const status = useSystemStatus()
  const me = useMe()
  const [staleCutoff] = useState(() => Date.now() - 60 * 60 * 1000)
  const pending = useApprovals(['PENDING_APPROVAL', 'PROPOSED'])
  const notifications = useNotifications()
  const readAll = useAction(() => api.readAllNotifications(), { invalidate: [keys.notifications] })

  const unread = notifications.data?.items.filter((n) => !n.read_at).length ?? 0
  const llm = status.data?.llm
  const inference = llm ? inferenceState(llm) : null
  const staleAccount = status.data?.accounts.find((a) => a.status === 'active' && a.last_successful_sync_at &&
    new Date(a.last_successful_sync_at).getTime() < staleCutoff)
  const reauth = status.data?.accounts.find((a) => a.status === 'needs_reauth')

  return (
    <div className="flex min-h-screen bg-bg">
      <a href="#main" className="sr-only-focusable rounded bg-primary px-3 py-2 text-primary-fg">Skip to content</a>
      <aside className="hidden w-64 shrink-0 border-r border-border bg-surface lg:block">
        <div className="sticky top-0 h-screen"><NavigationSidebar badges={{ '/approvals': pending.data?.total ?? 0 }} /></div>
      </aside>
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-overlay" aria-hidden onClick={() => setDrawer(false)} />
          <div className="relative h-full w-72 bg-surface shadow-pop">
            <Button variant="ghost" size="icon" className="absolute top-3 right-3" aria-label="Close navigation" onClick={() => setDrawer(false)}>
              <X className="h-5 w-5" aria-hidden />
            </Button>
            <NavigationSidebar badges={{ '/approvals': pending.data?.total ?? 0 }} onNavigate={() => setDrawer(false)} />
          </div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <TopNavigation
          userEmail={session?.user.email}
          unreadNotifications={unread}
          onSearch={(q) => navigate(`/search?q=${encodeURIComponent(q)}`)}
          onOpenMenu={() => setDrawer(true)}
          onOpenNotifications={() => setNotifOpen(true)}
          onProfile={() => navigate('/settings/accounts')}
          onSignOut={() => void signOut().then(() => navigate('/login'))}
        />
        {me.data?.is_demo && (
          <Banner tone="warning" icon={<FlaskConical className="h-4 w-4" aria-hidden />}>
            You are signed in to the demo account ({me.data.email}), which shows sample data.{' '}
            <button type="button" className="underline" onClick={() => void signOut().then(() => navigate('/login'))}>Sign out</button> and sign in with your own account to see your mail.
          </Banner>
        )}
        {!online && <Banner tone="danger" icon={<WifiOff className="h-4 w-4" aria-hidden />}>You are offline. Showing cached data; changes will fail until you reconnect.</Banner>}
        {status.isError && online && <Banner tone="danger" icon={<ServerCrash className="h-4 w-4" aria-hidden />}>The MailPilot server is unreachable. Data may be stale.</Banner>}
        {status.data?.worker?.stalled && (
          <Banner tone="danger" icon={<ServerCrash className="h-4 w-4" aria-hidden />}>
            The background worker is not running, so syncs, analysis and briefings are waiting. Restart MailPilot with <code>npm run restart</code> in the project folder.
          </Banner>
        )}
        {inference === 'unreachable' && (
          <Banner tone="warning" icon={<CloudOff className="h-4 w-4" aria-hidden />}>
            DGX inference is offline. New emails get labelled rule-based analysis and AI analysis is queued until it returns. <Link className="underline" to="/settings/accounts">Diagnostics</Link>
          </Banner>
        )}
        {inference === 'model_missing' && (
          <Banner tone="warning" icon={<CloudOff className="h-4 w-4" aria-hidden />}>
            The DGX is reachable but does not serve the configured model{llm?.model ? ` (${llm.model})` : ''}. Analysis is rule-based until it does. <Link className="underline" to="/settings/accounts">Diagnostics</Link>
          </Banner>
        )}
        {inference === 'not_configured' && (
          <Banner tone="warning" icon={<CloudOff className="h-4 w-4" aria-hidden />}>
            No DGX inference endpoint is configured. Analysis is rule-based only. <Link className="underline" to="/settings/accounts">Diagnostics</Link>
          </Banner>
        )}
        {reauth && <Banner tone="warning" icon={<CloudOff className="h-4 w-4" aria-hidden />}>{reauth.email} needs to be reconnected. <Link className="underline" to="/settings/accounts">Reconnect</Link></Banner>}
        {staleAccount && <Banner tone="warning" icon={<CloudOff className="h-4 w-4" aria-hidden />}>Mail last synced {relativeTime(staleAccount.last_successful_sync_at)}; it may be out of date.</Banner>}
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 focus:outline-none sm:px-6">
          <Outlet />
        </main>
      </div>
      <Dialog open={notifOpen} onClose={() => setNotifOpen(false)} title="Notifications"
        footer={unread > 0 ? <Button variant="secondary" size="sm" loading={readAll.isPending} onClick={() => readAll.mutate(undefined)}>Mark all as read</Button> : undefined}>
        {notifications.data?.items.length ? (
          <ul className="space-y-2">
            {notifications.data.items.map((n) => (
              <li key={n.id} className={cn('rounded-md border p-3', n.read_at ? 'border-border' : 'border-primary/40 bg-primary-soft')}>
                <p className="text-sm font-medium text-fg">{n.title}</p>
                {n.body && <p className="text-sm text-fg-muted">{n.body}</p>}
                <div className="mt-1 flex items-center gap-3 text-xs text-fg-subtle">
                  <span>{relativeTime(n.created_at)}</span>
                  {n.link && <Link className="text-primary hover:underline" to={n.link} onClick={() => { setNotifOpen(false); void api.readNotification(n.id) }}>Open</Link>}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No notifications" description="Reminders and briefings appear here." />
        )}
      </Dialog>
    </div>
  )
}
