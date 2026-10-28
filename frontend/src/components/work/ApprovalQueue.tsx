import { ShieldCheck } from 'lucide-react'
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/ui/States'
import type { Approval } from '@/lib/types'
import { ApprovalCard, type ApprovalCardProps } from './ApprovalCard'

export interface ApprovalQueueProps extends Omit<ApprovalCardProps, 'approval' | 'busy'> {
  approvals: Approval[] | undefined
  loading?: boolean
  error?: unknown
  onRetryLoad?: () => void
  busyId?: string | null
  emptyTitle?: string
}

export function ApprovalQueue({ approvals, loading, error, onRetryLoad, busyId, emptyTitle = 'Nothing waiting for your approval', ...handlers }: ApprovalQueueProps) {
  if (loading && !approvals) return <LoadingSkeleton variant="card" lines={3} label="Loading approvals" />
  if (error) return <ErrorState error={error} onRetry={onRetryLoad} />
  if (!approvals || approvals.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        description="Replies, labels and archive operations appear here first. Nothing changes in Gmail until you approve it."
        icon={<ShieldCheck className="h-6 w-6" aria-hidden />}
      />
    )
  }
  return (
    <ul aria-label="Approval requests" className="space-y-3">
      {approvals.map((a) => <li key={a.id}><ApprovalCard approval={a} busy={busyId === a.id} {...handlers} /></li>)}
    </ul>
  )
}
