import { Archive, MailOpen, Tag } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { FilterBar } from '@/components/layout/FilterBar'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmailList } from '@/components/mail/EmailList'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Input'
import { Pagination } from '@/components/ui/Pagination'
import { SearchInput } from '@/components/ui/SearchInput'
import { useAction, useEmails } from '@/hooks/queries'
import { ApiError, api, type EmailFilters } from '@/lib/api'
import type { Priority } from '@/lib/types'

const FILTERS = [
  { id: 'HIGH', label: 'High' },
  { id: 'MEDIUM', label: 'Medium' },
  { id: 'LOW', label: 'Low' },
  { id: 'unread', label: 'Unread' },
  { id: 'action', label: 'Action required' },
  { id: 'reply', label: 'Needs reply' },
  { id: 'review', label: 'Needs review' },
  { id: 'risky', label: 'Suspicious' },
  { id: 'newsletter', label: 'Newsletters' },
]
const SORTS = [
  { id: 'priority', label: 'Priority' },
  { id: 'newest', label: 'Newest' },
  { id: 'oldest', label: 'Oldest' },
  { id: 'deadline', label: 'Deadline' },
]
const LIMIT = 50

export function filtersFromParams(active: string[], q: string, sort: string, offset: number): EmailFilters {
  const priority = active.filter((a): a is Priority => a === 'HIGH' || a === 'MEDIUM' || a === 'LOW')
  return {
    limit: LIMIT, offset, q: q || undefined, sort: sort as EmailFilters['sort'],
    priority: priority.length ? priority : undefined,
    unread: active.includes('unread') || undefined,
    action_required: active.includes('action') || undefined,
    reply_needed: active.includes('reply') || undefined,
    needs_review: active.includes('review') || undefined,
    risky: active.includes('risky') || undefined,
    newsletter: active.includes('newsletter') ? true : undefined,
  }
}

export default function InboxPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const active = params.getAll('f')
  const q = params.get('q') ?? ''
  const sort = params.get('sort') ?? 'priority'
  const offset = Number(params.get('offset') ?? 0)
  const filters = useMemo(() => filtersFromParams(active, q, sort, offset), [active.join(','), q, sort, offset]) // eslint-disable-line react-hooks/exhaustive-deps
  const emails = useEmails(filters)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [labelOpen, setLabelOpen] = useState(false)
  const [labelName, setLabelName] = useState('')

  const update = (patch: Record<string, string | string[] | null>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) {
      next.delete(k)
      if (Array.isArray(v)) v.forEach((x) => next.append(k, x))
      else if (v) next.set(k, v)
    }
    if (!('offset' in patch)) next.delete('offset')
    setParams(next, { replace: true })
  }

  const propose = useAction(
    (body: { action_type: 'archive' | 'apply_label' | 'mark_read'; label_name?: string }) =>
      api.proposeAction({ ...body, message_ids: [...checked] }),
    {
      success: 'Approval request created — review it in Approvals',
      invalidate: [['approvals']],
      onSuccess: () => { setChecked(new Set()); setLabelOpen(false); setLabelName('') },
      errorTitle: 'Could not create the request',
    },
  )
  const needsUpgrade = propose.error instanceof ApiError && propose.error.code === 'permission_upgrade_required'

  return (
    <div className="space-y-4">
      <PageHeader title="Priority inbox" description="Sorted by AI priority with deterministic safety rules. Open an email to see why it was ranked." />
      <SearchInput label="Filter by sender or subject" placeholder="Filter by sender, subject or text" defaultValue={q} onSubmit={(v) => update({ q: v || null })} />
      <FilterBar label="Inbox filters" options={FILTERS} active={active} onChange={(a) => update({ f: a })}
        sort={{ value: sort, options: SORTS, onChange: (v) => update({ sort: v }) }} />
      {checked.size > 0 && (
        <div role="region" aria-label="Bulk actions" className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-primary-soft p-2 text-sm">
          <span className="px-2 font-medium text-fg">{checked.size} selected</span>
          <Button size="sm" variant="secondary" leftIcon={<Archive className="h-4 w-4" aria-hidden />} loading={propose.isPending}
            onClick={() => propose.mutate({ action_type: 'archive' })}>Propose archive</Button>
          <Button size="sm" variant="secondary" leftIcon={<MailOpen className="h-4 w-4" aria-hidden />} loading={propose.isPending}
            onClick={() => propose.mutate({ action_type: 'mark_read' })}>Propose mark read</Button>
          <Button size="sm" variant="secondary" leftIcon={<Tag className="h-4 w-4" aria-hidden />} onClick={() => setLabelOpen(true)}>Propose label…</Button>
          <Button size="sm" variant="ghost" onClick={() => setChecked(new Set())}>Clear selection</Button>
          <span className="w-full px-2 text-xs text-fg-muted">Nothing changes in Gmail until you approve the request.</span>
          {needsUpgrade && (
            <span className="w-full px-2 text-xs text-warning">
              Labels and archiving need Gmail modify permission. <button className="underline" onClick={() => navigate('/settings/accounts')}>Grant it in account settings</button>.
            </span>
          )}
        </div>
      )}
      <EmailList
        emails={emails.data?.items}
        loading={emails.isLoading || emails.isFetching}
        error={emails.error}
        onRetry={() => void emails.refetch()}
        onOpen={(id) => navigate(`/inbox/${id}`)}
        selectable
        checkedIds={checked}
        onCheckedChange={(id, on) => setChecked((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n })}
        emptyTitle={active.length || q ? 'No emails match these filters' : 'Your inbox is empty'}
        emptyDescription={active.length || q ? 'Try removing a filter.' : 'Synced email will appear here.'}
      />
      {emails.data && <Pagination total={emails.data.total} limit={LIMIT} offset={offset} onChange={(o) => update({ offset: String(o) })} />}
      <Dialog open={labelOpen} onClose={() => setLabelOpen(false)} title="Propose a Gmail label" size="sm"
        description={`Apply a label to ${checked.size} email(s) after you approve it.`}
        footer={<><Button variant="secondary" onClick={() => setLabelOpen(false)}>Cancel</Button>
          <Button disabled={!labelName.trim()} loading={propose.isPending} onClick={() => propose.mutate({ action_type: 'apply_label', label_name: labelName.trim() })}>Create request</Button></>}>
        <Input label="Label name" value={labelName} onChange={(e) => setLabelName(e.target.value)} maxLength={100} placeholder="e.g. Finance/Invoices" />
      </Dialog>
    </div>
  )
}
