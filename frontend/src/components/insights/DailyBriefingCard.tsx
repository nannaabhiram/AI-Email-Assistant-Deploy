import { AlarmClock, Bot, CalendarDays, Mail, RefreshCw, Reply, Sparkles, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/States'
import { PriorityBadge } from '@/components/mail/PriorityBadge'
import { formatDate, formatDateTime, relativeTime } from '@/lib/format'
import type { Briefing, BriefingItem } from '@/lib/types'

export interface DailyBriefingCardProps {
  briefing: Briefing | null
  onGenerate?: () => void
  generating?: boolean
  compact?: boolean
}

function Group({ icon, title, items, render }: { icon: ReactNode; title: string; items: BriefingItem[]; render: (i: BriefingItem) => ReactNode }) {
  if (items.length === 0) return null
  return (
    <div>
      <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-fg-muted uppercase">{icon}{title} ({items.length})</h3>
      <ul className="space-y-1">{items.map((it) => <li key={it.id} className="text-sm text-fg">{render(it)}</li>)}</ul>
    </div>
  )
}

export function DailyBriefingCard({ briefing, onGenerate, generating, compact = false }: DailyBriefingCardProps) {
  if (!briefing) {
    return (
      <EmptyState
        title="No briefing yet"
        description="Briefings are generated at your preferred time each day, or on demand."
        icon={<CalendarDays className="h-6 w-6" aria-hidden />}
        action={onGenerate && <Button size="sm" onClick={onGenerate} loading={generating}>Generate now</Button>}
      />
    )
  }
  const c = briefing.content
  const actions = c.llm_recommended_actions?.length ? c.llm_recommended_actions : c.recommended_actions
  const emailLink = (it: BriefingItem) => <Link className="hover:underline" to={`/inbox/${it.id}`}>{it.subject || '(no subject)'}</Link>
  const taskLine = (it: BriefingItem) => (
    <span>{it.title}{it.due_at && <span className="text-fg-subtle"> · {formatDateTime(it.due_at)}</span>}</span>
  )
  const [headline, ...rest] = (briefing.narrative ?? '').split('\n\n')
  return (
    <section aria-label={`Daily briefing for ${formatDate(briefing.briefing_date)}`} className="space-y-4 rounded-lg border border-border bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold text-fg">Briefing · {formatDate(briefing.briefing_date)}</h2>
        {briefing.source === 'rules' ? (
          <Badge tone="outline" icon={<Bot className="h-3 w-3" aria-hidden />}>Rule-based</Badge>
        ) : (
          <Badge tone="primary" icon={<Sparkles className="h-3 w-3" aria-hidden />}>AI narrative</Badge>
        )}
        <span className="text-xs text-fg-subtle">Generated {relativeTime(briefing.created_at)}</span>
        {onGenerate && <Button className="ml-auto" size="sm" variant="ghost" onClick={onGenerate} loading={generating} leftIcon={<RefreshCw className="h-4 w-4" aria-hidden />}>Regenerate</Button>}
      </div>
      {briefing.source === 'rules' && briefing.error && (
        <p className="text-xs text-fg-subtle">No AI narrative: {briefing.error}</p>
      )}
      {briefing.narrative && (
        <div className="rounded-md bg-primary-soft p-3">
          <p className="text-sm font-semibold text-fg">{headline}</p>
          {rest.length > 0 && <p className="mt-1 text-sm text-fg">{rest.join('\n\n')}</p>}
        </div>
      )}
      <p className="text-sm text-fg-muted">
        Since the last briefing: <strong className="text-fg">{c.changes.new_messages}</strong> new emails,{' '}
        <strong className="text-fg">{c.changes.new_high}</strong> high priority,{' '}
        <strong className="text-fg">{c.changes.new_risky}</strong> flagged risky, {c.changes.tasks_completed} task(s) completed.
      </p>
      <div className={compact ? 'space-y-3' : 'grid gap-4 md:grid-cols-2'}>
        <Group icon={<Mail className="h-3.5 w-3.5" aria-hidden />} title="Most important" items={c.top_emails.slice(0, compact ? 3 : 6)} render={(it) => (
          <span className="flex flex-wrap items-center gap-1.5"><PriorityBadge priority={it.priority ?? 'HIGH'} />{emailLink(it)}
            {(it.risk_level === 'high' || it.risk_level === 'medium') && <Badge tone="danger">Risky</Badge>}</span>
        )} />
        <Group icon={<TriangleAlert className="h-3.5 w-3.5" aria-hidden />} title="Overdue" items={[...c.overdue_tasks, ...c.overdue_commitments.map((x) => ({ ...x, title: x.description }))]} render={taskLine} />
        <Group icon={<AlarmClock className="h-3.5 w-3.5" aria-hidden />} title="Due today" items={c.due_today} render={taskLine} />
        <Group icon={<Reply className="h-3.5 w-3.5" aria-hidden />} title="Awaiting your reply" items={c.awaiting_reply.slice(0, compact ? 3 : 10)} render={emailLink} />
        {!compact && <Group icon={<AlarmClock className="h-3.5 w-3.5" aria-hidden />} title="Upcoming" items={c.upcoming} render={taskLine} />}
        {!compact && <Group icon={<CalendarDays className="h-3.5 w-3.5" aria-hidden />} title="Meetings" items={c.meetings} render={(it) => (
          <span>{it.title || 'Meeting'}{it.start_at && <span className="text-fg-subtle"> · {formatDateTime(it.start_at)}</span>}</span>
        )} />}
      </div>
      {actions.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-fg-muted uppercase">Recommended actions</h3>
          <ol className="list-decimal space-y-0.5 pl-5 text-sm text-fg">{actions.map((a, i) => <li key={i}>{a}</li>)}</ol>
        </div>
      )}
    </section>
  )
}
