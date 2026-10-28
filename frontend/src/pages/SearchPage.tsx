import { useQuery } from '@tanstack/react-query'
import { Bot, Sparkles } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { DeadlineIndicator } from '@/components/mail/DeadlineIndicator'
import { PriorityBadge } from '@/components/mail/PriorityBadge'
import { SenderIdentity } from '@/components/mail/SenderIdentity'
import { Badge } from '@/components/ui/Badge'
import { SearchInput } from '@/components/ui/SearchInput'
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/ui/States'
import { api } from '@/lib/api'
import { humanize, relativeTime } from '@/lib/format'
import type { Priority } from '@/lib/types'

const EXAMPLES = [
  'Find the email where I received the project deadline',
  'Show messages from Priya about invoices',
  'Which emails require a response today?',
  'Find the last quotation someone sent me',
  'Emails mentioning 28,40,000',
  'Which commitments have I not completed?',
]

type Row = Record<string, unknown>
const s = (v: unknown) => (typeof v === 'string' ? v : null)

export default function SearchPage() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const q = params.get('q') ?? ''
  const result = useQuery({ queryKey: ['search', q], queryFn: () => api.search(q), enabled: q.length >= 2, staleTime: 60_000 })
  const run = (value: string) => setParams(value ? { q: value } : {})

  return (
    <div className="space-y-5">
      <PageHeader title="Search" description="Ask in plain language. Your question is turned into filters, full-text and (if configured) semantic search over your own mail only." />
      <SearchInput key={q} label="Search your mail" size="lg" defaultValue={q} placeholder="Which emails require a response today?" onSubmit={run} />
      {!q && (
        <div>
          <p className="mb-2 text-sm text-fg-muted">Try:</p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => <button key={ex} type="button" onClick={() => run(ex)} className="rounded-full border border-border-strong px-3 py-1 text-sm text-fg-muted hover:bg-surface-muted">{ex}</button>)}
          </div>
        </div>
      )}
      {q && result.isLoading && <LoadingSkeleton variant="list" lines={5} label="Searching" />}
      {q && result.error && <ErrorState error={result.error} onRetry={() => void result.refetch()} />}
      {result.data && (
        <section aria-label="Search results" className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
            <Badge tone={result.data.parser.startsWith('llm') ? 'primary' : 'outline'} icon={result.data.parser.startsWith('llm') ? <Sparkles className="h-3 w-3" aria-hidden /> : <Bot className="h-3 w-3" aria-hidden />}>
              {result.data.parser.startsWith('llm') ? 'Understood by AI' : 'Keyword interpretation'}
            </Badge>
            <span>Searching {result.data.target}:</span>
            {Object.entries(result.data.filters).filter(([k, v]) => k !== 'target' && v !== false && !(Array.isArray(v) && v.length === 0) && !(k === 'sort' && v === 'relevance')).map(([k, v]) => (
              <Badge key={k} tone="neutral">{humanize(k)}: {Array.isArray(v) ? v.join(', ') : String(v)}</Badge>
            ))}
          </div>
          {result.data.results.length === 0 ? (
            <EmptyState title="No matches" description="Try different words, a sender name, or fewer conditions." />
          ) : result.data.target === 'emails' ? (
            <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
              {result.data.results.map((r: Row) => (
                <li key={String(r.id)}>
                  <button type="button" onClick={() => navigate(`/inbox/${String(r.id)}`)} className="w-full px-4 py-3 text-left hover:bg-surface-muted">
                    <div className="flex items-center justify-between gap-2">
                      <SenderIdentity name={s(r.from_name)} email={s(r.from_address)} showEmail={false} size="sm" />
                      <span className="text-xs text-fg-subtle">{relativeTime(s(r.internal_date))}</span>
                    </div>
                    <p className="mt-1 text-sm font-medium text-fg">{s(r.subject) || '(no subject)'}</p>
                    <p className="line-clamp-2 text-sm text-fg-muted">{s(r.summary) || s(r.snippet)}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <PriorityBadge priority={(s(r.priority) as Priority | null) ?? null} />
                      <DeadlineIndicator dueAt={s(r.deadline_at)} compact />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="space-y-2">
              {result.data.results.map((r: Row) => (
                <li key={String(r.id)} className="rounded-lg border border-border bg-surface p-3">
                  <p className="text-sm font-medium text-fg">{s(r.title) ?? s(r.description)}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-fg-muted">
                    {r.direction ? <Badge tone="outline">{r.direction === 'by_me' ? 'You promised' : 'Owed to you'}</Badge> : null}
                    {s(r.counterparty) && <span>{s(r.counterparty)}</span>}
                    <Badge>{String(r.status)}</Badge>
                    <DeadlineIndicator dueAt={s(r.due_at)} compact />
                    {s(r.source_message_id) && <Link className="text-primary hover:underline" to={`/inbox/${s(r.source_message_id)}`}>Source email</Link>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
