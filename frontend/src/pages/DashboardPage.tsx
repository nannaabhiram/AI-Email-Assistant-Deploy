import { AlarmClock, ArrowDown, ArrowRight, ArrowUp, Cpu, Mail, RefreshCw, Reply, ShieldCheck, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { DailyBriefingCard } from '@/components/insights/DailyBriefingCard'
import { MetricCard } from '@/components/insights/MetricCard'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmailList } from '@/components/mail/EmailList'
import { TaskList } from '@/components/work/TaskList'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, EmptyState } from '@/components/ui/States'
import {
  keys, useAction, useAnalytics, useApprovals, useCommitments, useEmails, useJobWatcher, useLatestBriefing, useMe, useSystemStatus, useTasks,
} from '@/hooks/queries'
import { api } from '@/lib/api'
import { formatDateTime, relativeTime } from '@/lib/format'

export default function DashboardPage() {
  const navigate = useNavigate()
  const [now] = useState(() => new Date())
  const me = useMe()
  const status = useSystemStatus()
  const analytics = useAnalytics(7)
  const important = useEmails({ priority: ['HIGH'], limit: 5, sort: 'priority' })
  const unread = useEmails({ unread: true, limit: 1 })
  const actionReq = useEmails({ action_required: true, limit: 1 })
  const today = useTasks({ due: 'today', status: ['open', 'suggested'] })
  const overdueTasks = useTasks({ due: 'overdue' })
  const commitments = useCommitments({ status: ['open'] })
  const approvals = useApprovals(['PENDING_APPROVAL', 'PROPOSED'])
  const briefing = useLatestBriefing()
  const briefingJob = useJobWatcher([keys.latestBriefing])
  const generate = useAction(() => api.generateBriefing(), { success: 'Briefing is being generated', onSuccess: (r) => briefingJob.watch(r.job_id) })

  const account = me.data?.accounts[0]
  const sync = useAction((id: string) => api.sync(id), { success: 'Sync queued', invalidate: [keys.status] })
  const dist = analytics.data?.priority_distribution ?? {}
  const overdueCommitments = (commitments.data?.items ?? []).filter((c) => c.due_at && new Date(c.due_at) < now)
  const llm = status.data?.llm
  const syncInfo = status.data?.accounts[0]

  if (me.data && me.data.accounts.length === 0) {
    return (
      <EmptyState
        title="Connect Gmail to get started"
        description="MailPilot needs read-only access to prioritise and summarise your email."
        icon={<Mail className="h-6 w-6" aria-hidden />}
        action={<Button onClick={() => navigate('/onboarding')}>Connect Gmail</Button>}
      />
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Good ${now.getHours() < 12 ? 'morning' : now.getHours() < 18 ? 'afternoon' : 'evening'}${me.data?.display_name ? `, ${me.data.display_name}` : ''}`}
        description="Your inbox at a glance. Every send, label and archive waits for your approval."
        actions={account && account.status === 'active' && (
          <Button variant="secondary" size="sm" loading={sync.isPending} onClick={() => sync.mutate(account.id)} leftIcon={<RefreshCw className="h-4 w-4" aria-hidden />}>Sync now</Button>
        )}
      />
      <section aria-label="Key numbers" className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <MetricCard label="High priority (7d)" value={dist.HIGH ?? 0} tone="high" icon={<ArrowUp className="h-4 w-4" />} href="/inbox?f=HIGH" loading={analytics.isLoading} />
        <MetricCard label="Medium (7d)" value={dist.MEDIUM ?? 0} tone="medium" icon={<ArrowRight className="h-4 w-4" />} href="/inbox?f=MEDIUM" loading={analytics.isLoading} />
        <MetricCard label="Low (7d)" value={dist.LOW ?? 0} tone="low" icon={<ArrowDown className="h-4 w-4" />} href="/inbox?f=LOW" loading={analytics.isLoading} />
        <MetricCard label="Unread" value={unread.data?.total} icon={<Mail className="h-4 w-4" />} href="/inbox?f=unread" loading={unread.isLoading} />
        <MetricCard label="Action required" value={actionReq.data?.total} icon={<Reply className="h-4 w-4" />} href="/inbox?f=action" loading={actionReq.isLoading} />
        <MetricCard label="Due today" value={today.data?.total} tone="warning" icon={<AlarmClock className="h-4 w-4" />} href="/tasks" loading={today.isLoading} />
        <MetricCard label="Pending approvals" value={approvals.data?.total} tone={approvals.data?.total ? 'warning' : 'neutral'} icon={<ShieldCheck className="h-4 w-4" />} href="/approvals" loading={approvals.isLoading} />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Recent important emails" actions={<Link className="text-sm text-primary hover:underline" to="/inbox?f=HIGH">View all</Link>}>
            <EmailList emails={important.data?.items} loading={important.isLoading} error={important.error} onRetry={() => void important.refetch()}
              onOpen={(id) => navigate(`/inbox/${id}`)} emptyTitle="No high-priority email" emptyDescription="Nothing urgent right now." label="Important emails" />
          </Card>
          <DailyBriefingCard briefing={briefing.data ?? null} compact onGenerate={() => generate.mutate(undefined)} generating={generate.isPending || briefingJob.running} />
        </div>
        <div className="space-y-6">
          <Card title="System status">
            <dl className="space-y-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <dt className="flex items-center gap-1.5 text-fg-muted"><RefreshCw className="h-4 w-4" aria-hidden />Last sync</dt>
                <dd className="text-right text-fg">
                  {syncInfo?.last_successful_sync_at ? <span title={formatDateTime(syncInfo.last_successful_sync_at)}>{relativeTime(syncInfo.last_successful_sync_at)}</span> : 'Never'}
                  {syncInfo?.sync_status === 'running' && <Badge tone="info" className="ml-2">Running</Badge>}
                  {syncInfo?.sync_status === 'failed' && <Badge tone="danger" className="ml-2">Failed</Badge>}
                  {syncInfo?.last_error && <p className="mt-1 max-w-56 text-xs text-danger">{syncInfo.last_error}</p>}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-2">
                <dt className="flex items-center gap-1.5 text-fg-muted"><Cpu className="h-4 w-4" aria-hidden />DGX inference</dt>
                <dd className="text-right">
                  {!llm ? '—' : !llm.configured ? <Badge tone="warning">Not configured</Badge> : llm.reachable ? (
                    <Badge tone="success">Online · {llm.latency_ms} ms</Badge>
                  ) : <Badge tone="danger">Unreachable</Badge>}
                  {llm?.model && <p className="mt-1 text-xs text-fg-subtle">{llm.model}{llm.reachable && !llm.model_available ? ' (not served!)' : ''}</p>}
                </dd>
              </div>
              {status.data && Object.keys(status.data.jobs).length > 0 && (
                <div className="flex items-start justify-between gap-2">
                  <dt className="text-fg-muted">Background jobs</dt>
                  <dd className="text-right text-xs text-fg">{Object.entries(status.data.jobs).map(([k, v]) => `${v} ${k}`).join(' · ')}</dd>
                </div>
              )}
              {status.data?.recent_job_failures.length ? (
                <div><dt className="flex items-center gap-1.5 text-danger"><TriangleAlert className="h-4 w-4" aria-hidden />Recent job failures</dt>
                  <dd><ul className="mt-1 space-y-1 text-xs text-fg-muted">{status.data.recent_job_failures.map((f, i) => <li key={i}><span className="font-mono">{f.job_type}</span>: {f.error}</li>)}</ul></dd>
                </div>
              ) : null}
            </dl>
          </Card>
          <Card title="Due today">
            <TaskList tasks={today.data?.items} loading={today.isLoading} error={today.error} onRetry={() => void today.refetch()} emptyTitle="Nothing due today" />
          </Card>
          <Card title="Overdue" actions={<Link className="text-sm text-primary hover:underline" to="/tasks">Manage</Link>}>
            {(overdueTasks.data?.items.length ?? 0) + overdueCommitments.length === 0 ? (
              <p className="text-sm text-fg-muted">No overdue tasks or commitments.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {overdueTasks.data?.items.map((t) => <li key={t.id} className="text-danger">{t.title} <span className="text-xs text-fg-subtle">· {relativeTime(t.due_at)}</span></li>)}
                {overdueCommitments.map((c) => <li key={c.id} className="text-danger">{c.direction === 'by_me' ? 'You promised: ' : 'Owed to you: '}{c.description}</li>)}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
