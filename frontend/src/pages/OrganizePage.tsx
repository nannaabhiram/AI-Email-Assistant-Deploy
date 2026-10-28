import { Archive, Copy, Newspaper, Tag } from 'lucide-react'
import { useNavigate } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card, EmptyState, ErrorState, LoadingSkeleton } from '@/components/ui/States'
import { useAction, useNewsletters, useOrganize } from '@/hooks/queries'
import { ApiError, api } from '@/lib/api'
import { relativeTime } from '@/lib/format'
import type { OrganizeSuggestion } from '@/lib/types'

export default function OrganizePage() {
  const navigate = useNavigate()
  const suggestions = useOrganize()
  const digest = useNewsletters()
  const propose = useAction((s: OrganizeSuggestion) => api.proposeAction({ action_type: s.action_type, message_ids: s.message_ids, label_name: s.label_name }), {
    success: 'Approval request created', invalidate: [['approvals'], ['organize']], errorTitle: 'Could not create the request',
  })
  const needsModify = propose.error instanceof ApiError && propose.error.code === 'permission_upgrade_required'

  return (
    <div className="space-y-6">
      <PageHeader title="Organize & digests" description="Suggested labels and archive operations are previews only. Creating a request sends it to Approvals; nothing is unsubscribed, archived or deleted automatically." />
      {needsModify && (
        <p role="alert" className="rounded-md bg-warning-soft p-3 text-sm text-warning">
          Labels and archiving need the Gmail modify permission. <button className="underline" onClick={() => navigate('/settings/accounts')}>Grant it</button>, then try again.
        </p>
      )}
      <Card title="Suggested changes">
        {suggestions.isLoading ? <LoadingSkeleton lines={3} /> : suggestions.error ? <ErrorState error={suggestions.error} onRetry={() => void suggestions.refetch()} />
          : !suggestions.data?.suggestions.length ? <EmptyState title="Nothing to tidy up" description="No organization suggestions right now." />
          : (
            <ul className="space-y-2">
              {suggestions.data.suggestions.map((s, i) => (
                <li key={i} className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3">
                  {s.action_type === 'archive' ? <Archive className="h-5 w-5 text-fg-muted" aria-hidden /> : <Tag className="h-5 w-5 text-fg-muted" aria-hidden />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-fg">{s.title}</p>
                    <p className="text-xs text-fg-muted">{s.reason}</p>
                  </div>
                  <Button size="sm" variant="secondary" loading={propose.isPending && propose.variables === s} onClick={() => propose.mutate(s)}>Request approval</Button>
                </li>
              ))}
            </ul>
          )}
      </Card>
      <Card title="Newsletter digest (last 14 days)" description={digest.data?.note}>
        {digest.isLoading ? <LoadingSkeleton lines={3} /> : digest.error ? <ErrorState error={digest.error} onRetry={() => void digest.refetch()} />
          : !digest.data?.senders.length ? <EmptyState title="No newsletters detected" icon={<Newspaper className="h-6 w-6" aria-hidden />} />
          : (
            <ul className="divide-y divide-border">
              {digest.data.senders.map((s) => (
                <li key={s.from_address} className="flex flex-wrap items-start gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-fg">{s.from_name || s.from_address}</p>
                    <p className="text-xs text-fg-muted">{s.count} email(s) · {s.unread} unread · latest {relativeTime(s.latest_at)}</p>
                    <ul className="mt-1 list-disc pl-5 text-xs text-fg-muted">{s.recent_subjects.slice(-3).map((subj, i) => <li key={i}>{subj}</li>)}</ul>
                  </div>
                  <Button size="sm" variant="ghost" leftIcon={<Archive className="h-4 w-4" aria-hidden />}
                    onClick={() => propose.mutate({ action_type: 'archive', message_ids: s.message_ids, title: '', reason: '', label_name: null })}>
                    Propose archive all
                  </Button>
                </li>
              ))}
            </ul>
          )}
        {digest.data && digest.data.duplicates.length > 0 && (
          <div className="mt-4 border-t border-border pt-3">
            <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-fg"><Copy className="h-4 w-4" aria-hidden />Exact duplicates</h3>
            <ul className="space-y-1 text-sm">
              {digest.data.duplicates.map((d) => (
                <li key={d.message_id}><button type="button" className="text-primary hover:underline" onClick={() => navigate(`/inbox/${d.message_id}`)}>{d.subject ?? '(no subject)'}</button>
                  <span className="text-fg-muted"> from {d.from_address}</span></li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </div>
  )
}
