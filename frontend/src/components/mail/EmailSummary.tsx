import { Bot, Lightbulb, ListChecks, MessageCircleQuestion, Sparkles, Users } from 'lucide-react'
import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { relativeTime } from '@/lib/format'
import type { ThreadSummary } from '@/lib/types'

export interface EmailSummaryProps {
  summary: ThreadSummary | null
  stale?: boolean
  loading?: boolean
  onSummarize?: () => void
  className?: string
}

function Section({ icon, title, items }: { icon: ReactNode; title: string; items: string[] }) {
  if (items.length === 0) return null
  return (
    <div>
      <h4 className="mb-1 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-fg-muted uppercase">{icon}{title}</h4>
      <ul className="list-disc space-y-0.5 pl-5 text-sm text-fg">
        {items.map((item, i) => <li key={i}>{item}</li>)}
      </ul>
    </div>
  )
}

export function EmailSummary({ summary, stale = false, loading = false, onSummarize, className }: EmailSummaryProps) {
  if (!summary) {
    return (
      <div className={cn('flex flex-col items-start gap-2 rounded-lg border border-dashed border-border p-4', className)}>
        <p className="text-sm text-fg-muted">No thread summary yet.</p>
        {onSummarize && <Button size="sm" variant="subtle" loading={loading} onClick={onSummarize} leftIcon={<Sparkles className="h-4 w-4" aria-hidden />}>Summarize thread</Button>}
      </div>
    )
  }
  return (
    <section aria-label="Thread summary" className={cn('space-y-3 rounded-lg border border-border bg-surface p-4', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {summary.source === 'rules' ? (
            <Badge tone="outline" icon={<Bot className="h-3 w-3" aria-hidden />}>Extractive (AI unavailable)</Badge>
          ) : (
            <Badge tone="primary" icon={<Sparkles className="h-3 w-3" aria-hidden />}>AI summary</Badge>
          )}
          <span className="text-xs text-fg-subtle">Updated {relativeTime(summary.updated_at)}</span>
          {stale && <Badge tone="warning">New messages since summary</Badge>}
        </div>
        {onSummarize && <Button size="sm" variant="ghost" loading={loading} onClick={onSummarize}>Refresh</Button>}
      </div>
      <p className="text-sm font-medium text-fg">{summary.overview}</p>
      <div className="grid gap-3 md:grid-cols-2">
        <Section icon={<ListChecks className="h-3.5 w-3.5" aria-hidden />} title="Key points" items={summary.key_points} />
        <Section icon={<Lightbulb className="h-3.5 w-3.5" aria-hidden />} title="Decisions" items={summary.decisions} />
        <Section icon={<MessageCircleQuestion className="h-3.5 w-3.5" aria-hidden />} title="Unanswered questions" items={summary.open_questions} />
        <Section icon={<ListChecks className="h-3.5 w-3.5" aria-hidden />} title="Tasks" items={summary.tasks.map((t) => `${t.title}${t.owner ? ` — ${t.owner}` : ''}${t.due ? ` (due ${t.due})` : ''}`)} />
        <Section icon={<Users className="h-3.5 w-3.5" aria-hidden />} title="People" items={summary.people.map((p) => `${p.name}${p.role ? ` · ${p.role}` : ''}`)} />
      </div>
      {(summary.facts.length > 0 || summary.inferences.length > 0) && (
        <div className="grid gap-3 border-t border-border pt-3 md:grid-cols-2">
          <Section icon={null} title="Stated facts" items={summary.facts} />
          <Section icon={null} title="Inferences (not stated)" items={summary.inferences} />
        </div>
      )}
      {summary.next_action && (
        <p className="rounded-md bg-primary-soft px-3 py-2 text-sm text-fg"><span className="font-semibold text-primary">Next: </span>{summary.next_action}</p>
      )}
    </section>
  )
}
