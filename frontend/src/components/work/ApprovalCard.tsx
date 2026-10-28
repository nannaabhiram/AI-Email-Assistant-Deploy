import { Archive, CheckCircle2, Clock, Mail, RotateCcw, Tag, XCircle } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { cn } from '@/lib/cn'
import { formatDateTime, humanize, relativeTime } from '@/lib/format'
import type { Approval, ApprovalState } from '@/lib/types'

const STATE_TONE: Record<ApprovalState, 'neutral' | 'info' | 'warning' | 'success' | 'danger' | 'primary'> = {
  PROPOSED: 'info',
  PENDING_APPROVAL: 'warning',
  APPROVED: 'primary',
  EXECUTING: 'info',
  SUCCEEDED: 'success',
  REJECTED: 'neutral',
  EXPIRED: 'neutral',
  FAILED: 'danger',
  CANCELLED: 'neutral',
}

const ACTION_ICON = { send_reply: Mail, archive: Archive, apply_label: Tag, remove_label: Tag, mark_read: CheckCircle2, mark_unread: Mail }

export interface ApprovalCardProps {
  approval: Approval
  onApprove?: (approval: Approval) => void
  onReject?: (approval: Approval) => void
  onCancel?: (approval: Approval) => void
  onRetry?: (approval: Approval) => void
  busy?: boolean
  now?: Date
}

export function ApprovalCard({ approval: a, onApprove, onReject, onCancel, onRetry, busy, now }: ApprovalCardProps) {
  const [reviewed, setReviewed] = useState(false)
  const [renderedAt] = useState(() => new Date())
  const Icon = ACTION_ICON[a.action_type]
  const decidable = a.state === 'PENDING_APPROVAL' || a.state === 'PROPOSED'
  const isSend = a.action_type === 'send_reply'
  const expired = new Date(a.expires_at).getTime() < (now ?? renderedAt).getTime()
  return (
    <article aria-label={`${humanize(a.action_type)} approval`} className={cn('rounded-lg border bg-surface', decidable ? 'border-warning/50' : 'border-border')}>
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <Icon className="h-4 w-4 text-fg-muted" aria-hidden />
        <h3 className="text-sm font-semibold text-fg">{humanize(a.action_type)}</h3>
        <Badge tone={STATE_TONE[a.state]}>{humanize(a.state.toLowerCase())}</Badge>
        {a.proposed_by !== 'user' && <Badge tone="outline">Suggested by {a.proposed_by === 'ai' ? 'AI' : 'rules'}</Badge>}
        <span className="ml-auto flex items-center gap-1 text-xs text-fg-subtle">
          <Clock className="h-3 w-3" aria-hidden />
          {decidable ? (expired ? 'Expired' : `Expires ${relativeTime(a.expires_at, now)}`) : `Created ${relativeTime(a.created_at, now)}`}
        </span>
      </header>
      <div className="space-y-3 px-4 py-3">
        <p className="text-sm text-fg">{a.explanation}</p>
        {isSend ? (
          <dl className="space-y-1.5 rounded-md bg-surface-muted p-3 text-sm" aria-label="Exact message to be sent">
            <div className="flex gap-2"><dt className="w-16 shrink-0 text-fg-muted">From</dt><dd className="break-all text-fg">{a.params.account_email}</dd></div>
            <div className="flex gap-2"><dt className="w-16 shrink-0 text-fg-muted">To</dt><dd className="font-medium break-all text-fg">{a.params.to?.join(', ')}</dd></div>
            {(a.params.cc?.length ?? 0) > 0 && <div className="flex gap-2"><dt className="w-16 shrink-0 text-fg-muted">Cc</dt><dd className="break-all text-fg">{a.params.cc?.join(', ')}</dd></div>}
            <div className="flex gap-2"><dt className="w-16 shrink-0 text-fg-muted">Subject</dt><dd className="text-fg">{a.params.subject}</dd></div>
            <div><dt className="sr-only">Body</dt><dd className="mt-2 max-h-72 overflow-y-auto rounded border border-border bg-surface p-2 whitespace-pre-wrap text-fg">{a.params.body}</dd></div>
          </dl>
        ) : (
          <p className="text-sm text-fg-muted">
            {a.params.gmail_message_ids?.length ?? 0} message(s) in {a.params.account_email}
            {a.params.label_name ? ` · label “${a.params.label_name}”` : ''}
          </p>
        )}
        {a.execution && (
          <div className={cn('rounded-md px-3 py-2 text-sm', a.execution.state === 'failed' ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success')}>
            {a.execution.state === 'succeeded' && <>Completed {formatDateTime(a.execution.finished_at)}{a.execution.gmail_message_id && <> · Gmail ID <span className="font-mono">{a.execution.gmail_message_id}</span></>}{a.execution.result?.deduplicated ? ' · duplicate send prevented' : ''}</>}
            {a.execution.state === 'failed' && <>Failed after {a.execution.attempt_count} attempt(s): {a.execution.error}</>}
            {a.execution.state === 'executing' && <>Executing…</>}
            {a.execution.error && a.execution.state === 'succeeded' && <span className="block text-warning">{a.execution.error}</span>}
          </div>
        )}
        {a.decision_reason && !decidable && a.state !== 'SUCCEEDED' && <p className="text-xs text-fg-subtle">Reason: {humanize(a.decision_reason)}</p>}
        {decidable && !expired && (onApprove || onReject) && (
          <div className="space-y-3 border-t border-border pt-3">
            {isSend && (
              <Checkbox
                label="I have reviewed the exact recipients, subject and message above"
                description="Approving sends exactly this content. Any later edit cancels the approval."
                checked={reviewed}
                onChange={(e) => setReviewed(e.target.checked)}
              />
            )}
            <div className="flex flex-wrap gap-2">
              {onApprove && (
                <Button onClick={() => onApprove(a)} disabled={busy || (isSend && !reviewed)} loading={busy} leftIcon={<CheckCircle2 className="h-4 w-4" aria-hidden />}>
                  {isSend ? 'Approve and send' : 'Approve'}
                </Button>
              )}
              {onReject && <Button variant="secondary" onClick={() => onReject(a)} disabled={busy} leftIcon={<XCircle className="h-4 w-4" aria-hidden />}>Reject</Button>}
            </div>
          </div>
        )}
        {a.state === 'APPROVED' && onCancel && <Button variant="secondary" size="sm" onClick={() => onCancel(a)} disabled={busy}>Cancel before execution</Button>}
        {a.state === 'FAILED' && (
          <div className="flex gap-2">
            {onRetry && <Button size="sm" variant="secondary" onClick={() => onRetry(a)} disabled={busy} leftIcon={<RotateCcw className="h-4 w-4" aria-hidden />}>Retry safely</Button>}
            {onCancel && <Button size="sm" variant="ghost" onClick={() => onCancel(a)} disabled={busy}>Cancel</Button>}
          </div>
        )}
      </div>
    </article>
  )
}
