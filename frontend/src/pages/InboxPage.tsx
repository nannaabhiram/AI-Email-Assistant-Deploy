import { Archive, CheckCheck, ListChecks, Mail, MailOpen, Tag, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
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
import type { ActionType, Priority } from '@/lib/types'

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

type BulkAction = Exclude<ActionType, 'send_reply' | 'remove_label'>
const BULK: { id: BulkAction; label: string; icon: ReactNode; danger?: boolean }[] = [
  { id: 'mark_read', label: 'Read', icon: <MailOpen aria-hidden /> },
  { id: 'mark_unread', label: 'Unread', icon: <Mail aria-hidden /> },
  { id: 'archive', label: 'Archive', icon: <Archive aria-hidden /> },
  { id: 'apply_label', label: 'Label', icon: <Tag aria-hidden /> },
  { id: 'trash', label: 'Delete', icon: <Trash2 aria-hidden />, danger: true },
]

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
  const [selectMode, setSelectMode] = useState(false)
  const selecting = selectMode || checked.size > 0
  const pageIds = useMemo(() => emails.data?.items.map((e) => e.id) ?? [], [emails.data])
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => checked.has(id))
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

  const exitSelection = () => { setChecked(new Set()); setSelectMode(false) }
  const setOne = (id: string, on: boolean) => setChecked((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n })
  const toggleAll = () => setChecked((s) => {
    const n = new Set(s)
    pageIds.forEach((id) => (allOnPage ? n.delete(id) : n.add(id)))
    return n
  })

  useEffect(() => {
    if (!selecting) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !labelOpen && exitSelection()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [selecting, labelOpen])

  const propose = useAction(
    (body: { action_type: BulkAction; label_name?: string }) =>
      api.proposeAction({ ...body, message_ids: [...checked] }),
    {
      success: 'Approval request created — review it in Approvals',
      invalidate: [['approvals']],
      onSuccess: () => { exitSelection(); setLabelOpen(false); setLabelName('') },
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
      <div className="flex items-center justify-between gap-2 px-1">
        <p className="text-xs text-fg-muted">
          {selecting ? 'Tap emails to select them' : 'Tip: press and hold an email to start selecting'}
        </p>
        <Button size="sm" variant="glass" leftIcon={selecting ? <X className="h-4 w-4" aria-hidden /> : <ListChecks className="h-4 w-4" aria-hidden />}
          aria-pressed={selecting} onClick={() => (selecting ? exitSelection() : setSelectMode(true))}>
          {selecting ? 'Cancel' : 'Select'}
        </Button>
      </div>
      <EmailList
        emails={emails.data?.items}
        loading={emails.isLoading || emails.isFetching}
        error={emails.error}
        onRetry={() => void emails.refetch()}
        onOpen={(id) => navigate(`/inbox/${id}`)}
        selectable
        selectionMode={selecting}
        checkedIds={checked}
        onCheckedChange={setOne}
        onLongPress={(id) => { setSelectMode(true); setOne(id, true) }}
        emptyTitle={active.length || q ? 'No emails match these filters' : 'Your inbox is empty'}
        emptyDescription={active.length || q ? 'Try removing a filter.' : 'Synced email will appear here.'}
      />
      {selecting && (
        <div role="region" aria-label="Bulk actions" className="mp-bulkbar">
          <div className="mp-bulkbar__head">
            <button type="button" className="mp-bulkbar__all" aria-pressed={allOnPage} onClick={toggleAll} disabled={!pageIds.length}>
              <CheckCheck className="h-4 w-4" aria-hidden />{allOnPage ? 'Deselect all' : 'Select all'}
            </button>
            <span className="mp-bulkbar__count" aria-live="polite">{checked.size} selected</span>
            <button type="button" className="mp-bulkbar__close" aria-label="Cancel selection" onClick={exitSelection}><X className="h-4 w-4" aria-hidden /></button>
          </div>
          <div className="mp-bulkbar__actions">
            {BULK.map((a) => (
              <button key={a.id} type="button" className="mp-bulkbar__action" data-danger={a.danger || undefined}
                disabled={!checked.size || propose.isPending}
                onClick={() => (a.id === 'apply_label' ? setLabelOpen(true) : propose.mutate({ action_type: a.id }))}>
                {a.icon}<span>{a.label}</span>
              </button>
            ))}
          </div>
          <p className="mp-bulkbar__note">
            {needsUpgrade
              ? <span className="text-warning">These actions need Gmail modify permission. <button className="underline" onClick={() => navigate('/settings/accounts')}>Grant it in account settings</button>.</span>
              : 'Nothing changes in Gmail until you approve it. Deleted mail goes to Gmail Trash.'}
          </p>
        </div>
      )}
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
