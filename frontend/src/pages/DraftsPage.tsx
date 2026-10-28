import { PenLine } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { DraftEditor } from '@/components/work/DraftEditor'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog'
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/ui/States'
import { keys, useAction, useDraft, useDrafts, useSystemStatus } from '@/hooks/queries'
import { ApiError, api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { relativeTime } from '@/lib/format'

export default function DraftsPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const drafts = useDrafts()
  const draft = useDraft(id)
  const status = useSystemStatus()
  const [external, setExternal] = useState<string[] | null>(null)
  const [discarding, setDiscarding] = useState(false)
  const inv = [keys.drafts, keys.draft(id ?? ''), ['approvals']]

  const save = useAction((v: { to: string[]; cc: string[]; subject: string; body: string }) => api.updateDraft(id!, { version: draft.data!.version, ...v }), {
    success: 'Draft saved', invalidate: inv, errorTitle: 'Could not save',
  })
  const regenerate = useAction((v: { tone: Parameters<typeof api.regenerateDraft>[1]['tone']; custom: string | null; instructions: string | null }) =>
    api.regenerateDraft(id!, { tone: v.tone, custom_tone: v.custom, instructions: v.instructions }), { success: 'New version generated', invalidate: inv })
  const request = useAction((ack: boolean) => api.requestApproval(id!, ack), {
    success: 'Approval requested. Review and approve it in Approvals.', invalidate: inv,
    onSuccess: () => { setExternal(null); navigate('/approvals') },
  })
  const discard = useAction(() => api.discardDraft(id!), { success: 'Draft discarded', invalidate: inv, onSuccess: () => navigate('/drafts') })

  const requestError = request.error instanceof ApiError ? request.error : null
  useEffect(() => {
    if (requestError?.code === 'external_recipients_unconfirmed') {
      setExternal((requestError.details.external_recipients as string[]) ?? [])
      request.reset()
    }
  }, [requestError, request])

  return (
    <div>
      <PageHeader title="Reply drafts" description="Edit, regenerate and compare drafts. Sending always requires approval of the exact final text." />
      <div className="grid gap-6 lg:grid-cols-3">
        <nav aria-label="Drafts" className="lg:col-span-1">
          {drafts.isLoading ? <LoadingSkeleton variant="list" lines={4} /> : drafts.error ? <ErrorState error={drafts.error} onRetry={() => void drafts.refetch()} />
            : !drafts.data?.items.length ? <EmptyState title="No drafts" description="Open an email and choose “Draft reply”." icon={<PenLine className="h-6 w-6" aria-hidden />} />
            : (
              <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
                {drafts.data.items.map((d) => (
                  <li key={d.id}>
                    <Link to={`/drafts/${d.id}`} aria-current={d.id === id ? 'page' : undefined}
                      className={cn('block px-3 py-2.5 hover:bg-surface-muted', d.id === id && 'bg-primary-soft')}>
                      <p className="truncate text-sm font-medium text-fg">{d.subject || '(no subject)'}</p>
                      <p className="truncate text-xs text-fg-muted">To {d.to_addresses.join(', ')}</p>
                      <div className="mt-1 flex items-center gap-2"><Badge tone={d.status === 'sent' ? 'success' : d.status === 'draft' ? 'neutral' : 'warning'}>{d.status.replace('_', ' ')}</Badge>
                        <span className="text-xs text-fg-subtle">{relativeTime(d.updated_at)}</span></div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
        </nav>
        <section className="lg:col-span-2" aria-label="Draft editor">
          {!id ? <EmptyState title="Select a draft" description="Choose a draft on the left to edit it." />
            : draft.isLoading ? <LoadingSkeleton lines={8} />
            : draft.error || !draft.data ? <ErrorState error={draft.error} onRetry={() => void draft.refetch()} />
            : (
              <div className="space-y-3">
                {draft.data.reply_to_message_id && <Link className="text-sm text-primary hover:underline" to={`/inbox/${draft.data.reply_to_message_id}`}>View original email</Link>}
                <DraftEditor
                  draft={draft.data}
                  versions={draft.data.versions}
                  aiAvailable={Boolean(status.data?.llm.reachable)}
                  onSave={(v) => save.mutate(v)}
                  onRegenerate={(tone, custom, instructions) => regenerate.mutate({ tone, custom, instructions })}
                  onRequestApproval={() => request.mutate(false)}
                  onDiscard={() => setDiscarding(true)}
                  saving={save.isPending}
                  regenerating={regenerate.isPending}
                  requesting={request.isPending}
                />
                {requestError?.code === 'permission_upgrade_required' && (
                  <p role="alert" className="rounded-md bg-warning-soft p-3 text-sm text-warning">
                    Sending requires Gmail send permission. <Link className="underline" to="/settings/accounts">Grant it in account settings</Link>, then request approval again.
                  </p>
                )}
              </div>
            )}
        </section>
      </div>
      <ConfirmationDialog open={external !== null} title="Recipients outside this conversation"
        description="These addresses did not take part in the original thread. Confirm that you intend to include them."
        confirmLabel="Yes, include them" loading={request.isPending} onCancel={() => setExternal(null)} onConfirm={() => request.mutate(true)}>
        <ul className="list-disc pl-5 text-sm font-medium text-fg">{external?.map((e) => <li key={e}>{e}</li>)}</ul>
      </ConfirmationDialog>
      <ConfirmationDialog open={discarding} title="Discard this draft?" description="Any pending approval for it is cancelled." destructive confirmLabel="Discard"
        loading={discard.isPending} onCancel={() => setDiscarding(false)} onConfirm={() => discard.mutate(undefined)} />
      {draft.data?.status === 'sent' && <div className="mt-4"><Button variant="secondary" onClick={() => navigate('/approvals')}>View send record</Button></div>}
    </div>
  )
}
