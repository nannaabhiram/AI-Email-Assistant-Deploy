import { useState } from 'react'
import { AnalyticsChart } from '@/components/insights/AnalyticsChart'
import { MetricCard } from '@/components/insights/MetricCard'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, ErrorState } from '@/components/ui/States'
import { useAnalytics } from '@/hooks/queries'
import { cn } from '@/lib/cn'
import { humanize } from '@/lib/format'

const RANGES = [7, 30, 90]

function duration(seconds: number | null): string {
  if (seconds === null) return '—'
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)} h`
  return `${(seconds / 86400).toFixed(1)} d`
}

export default function AnalyticsPage() {
  const [days, setDays] = useState(30)
  const a = useAnalytics(days)
  const d = a.data
  const agreement = d?.high_priority_agreement
  return (
    <div className="space-y-6">
      <PageHeader title="Analytics" description="AI scores are estimates, not verified ground truth. Accuracy figures are based only on your explicit overrides."
        actions={
          <div role="group" aria-label="Time range" className="inline-flex rounded-md border border-border bg-surface p-0.5">
            {RANGES.map((r) => (
              <button key={r} type="button" aria-pressed={days === r} onClick={() => setDays(r)}
                className={cn('rounded px-3 py-1 text-sm', days === r ? 'bg-primary-soft font-medium text-primary' : 'text-fg-muted hover:text-fg')}>{r} days</button>
            ))}
          </div>
        } />
      {a.error ? <ErrorState error={a.error} onRetry={() => void a.refetch()} /> : (
        <>
          <section aria-label="Summary" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <MetricCard label="Received" value={d?.volume.reduce((s, v) => s + v.received, 0)} loading={a.isLoading} />
            <MetricCard label="Reply backlog" value={d?.response_backlog} tone={d?.response_backlog ? 'warning' : 'neutral'} loading={a.isLoading} />
            <MetricCard label="Median response time" value={duration(d?.median_response_seconds ?? null)} hint={d ? `${d.response_sample_size} replies measured` : undefined} loading={a.isLoading} />
            <MetricCard label="Overdue tasks" value={d?.tasks.overdue} tone={d?.tasks.overdue ? 'high' : 'neutral'} loading={a.isLoading} />
            <MetricCard label="Newsletters" value={d?.newsletter_volume} loading={a.isLoading} />
            <MetricCard label="HIGH agreement" value={agreement?.agreement_rate != null ? `${Math.round(agreement.agreement_rate * 100)}%` : '—'}
              hint={agreement ? `${agreement.overridden_down} of ${agreement.high_classified} downgraded by you` : undefined} loading={a.isLoading} />
          </section>
          <div className="grid gap-6 lg:grid-cols-2">
            <AnalyticsChart title="Email volume" description="Received and sent per day" kind="line" xKey="day" loading={a.isLoading}
              data={d?.volume ?? []} series={[{ key: 'received', label: 'Received' }, { key: 'sent', label: 'Sent' }]} formatX={(v) => v.slice(5)} />
            <AnalyticsChart title="Priority distribution" description="Effective priority (after your overrides)" kind="bar" xKey="priority" loading={a.isLoading}
              data={(['HIGH', 'MEDIUM', 'LOW'] as const).map((p) => ({ priority: humanize(p.toLowerCase()), count: d?.priority_distribution[p] ?? 0 }))}
              series={[{ key: 'count', label: 'Emails' }]} />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="User overrides" description="Model priority → your correction">
              {d?.overrides.length ? (
                <table className="w-full text-sm"><caption className="sr-only">Priority overrides</caption>
                  <thead className="text-left text-xs text-fg-muted"><tr><th className="py-1">Model</th><th>You</th><th className="text-right">Count</th></tr></thead>
                  <tbody>{d.overrides.map((o, i) => <tr key={i} className="border-t border-border"><td className="py-1">{o.model_priority}</td><td>{o.user_priority ?? 'reset'}</td><td className="text-right tabular-nums">{o.n}</td></tr>)}</tbody>
                </table>
              ) : <p className="text-sm text-fg-muted">No overrides in this period.</p>}
              {d && <p className="mt-2 text-xs text-fg-subtle">Analysis sources: {Object.entries(d.analysis_sources).map(([k, v]) => `${v} ${k === 'rules' ? 'rule-based' : k}`).join(' · ') || '—'}</p>}
            </Card>
            <Card title="AI latency & failures" description="Remote DGX inference calls">
              {d?.llm.length ? (
                <table className="w-full text-sm"><caption className="sr-only">LLM call statistics</caption>
                  <thead className="text-left text-xs text-fg-muted"><tr><th className="py-1">Task</th><th>Status</th><th className="text-right">Calls</th><th className="text-right">Avg</th><th className="text-right">p95</th></tr></thead>
                  <tbody>{d.llm.map((r, i) => (
                    <tr key={i} className="border-t border-border"><td className="py-1">{humanize(r.task)}</td>
                      <td className={r.status === 'ok' ? 'text-success' : 'text-danger'}>{r.status}</td>
                      <td className="text-right tabular-nums">{r.n}</td><td className="text-right tabular-nums">{r.avg_ms ?? '—'} ms</td>
                      <td className="text-right tabular-nums">{r.p95_ms != null ? Math.round(r.p95_ms) : '—'} ms</td></tr>
                  ))}</tbody>
                </table>
              ) : <p className="text-sm text-fg-muted">No AI calls recorded in this period.</p>}
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
