import { useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { ApprovalQueue } from '@/components/work/ApprovalQueue'
import { Textarea } from '@/components/ui/Input'
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog'
import { Tabs } from '@/components/ui/Tabs'
import { useAction, useApprovals } from '@/hooks/queries'
import { api } from '@/lib/api'
import type { Approval } from '@/lib/types'

export default function ApprovalsPage() {
  const pending = useApprovals(['PROPOSED', 'PENDING_APPROVAL'])
  const inFlight = useApprovals(['APPROVED', 'EXECUTING', 'FAILED'])
  const history = useApprovals(['SUCCEEDED', 'REJECTED', 'EXPIRED', 'CANCELLED'])
  const [rejecting, setRejecting] = useState<Approval | null>(null)
  const [reason, setReason] = useState('')
  const inv = [['approvals'], ['drafts']]

  // The hash the user reviewed is sent back; the server refuses if the action changed since.
  const approve = useAction((a: Approval) => api.approve(a.id, a.params_hash), {
    success: (a) => (a.action_type === 'send_reply' ? 'Approved. The reply is being sent.' : 'Approved. Applying the change in Gmail.'), invalidate: inv,
  })
  const reject = useAction((a: Approval) => api.reject(a.id, reason || undefined), {
    success: 'Rejected', invalidate: inv, onSuccess: () => { setRejecting(null); setReason('') },
  })
  const cancel = useAction((a: Approval) => api.cancelApproval(a.id), { success: 'Cancelled', invalidate: inv })
  const retry = useAction((a: Approval) => api.retryApproval(a.id), { success: 'Retry queued. Duplicate sends are prevented.', invalidate: inv })

  const busyId = [approve, reject, cancel, retry].find((m) => m.isPending)?.variables?.id ?? null
  const handlers = { onApprove: (a: Approval) => approve.mutate(a), onReject: (a: Approval) => setRejecting(a), onCancel: (a: Approval) => cancel.mutate(a), onRetry: (a: Approval) => retry.mutate(a), busyId }

  return (
    <div>
      <PageHeader title="Pending approvals" description="Every consequential Gmail action waits here. Approve exactly what you reviewed; changes to a draft cancel its approval automatically." />
      <Tabs
        label="Approval views"
        tabs={[
          { id: 'pending', label: 'Waiting for you', count: pending.data?.total, content: <ApprovalQueue approvals={pending.data?.items} loading={pending.isLoading} error={pending.error} onRetryLoad={() => void pending.refetch()} {...handlers} /> },
          { id: 'inflight', label: 'In progress & failed', count: inFlight.data?.total, content: <ApprovalQueue approvals={inFlight.data?.items} loading={inFlight.isLoading} error={inFlight.error} emptyTitle="Nothing in progress" {...handlers} /> },
          { id: 'history', label: 'History', content: <ApprovalQueue approvals={history.data?.items} loading={history.isLoading} error={history.error} emptyTitle="No history yet" /> },
        ]}
      />
      <ConfirmationDialog open={rejecting !== null} title="Reject this action?" description={rejecting?.explanation} confirmLabel="Reject"
        loading={reject.isPending} onCancel={() => setRejecting(null)} onConfirm={() => rejecting && reject.mutate(rejecting)}>
        <Textarea label="Reason (optional)" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
      </ConfirmationDialog>
    </div>
  )
}
