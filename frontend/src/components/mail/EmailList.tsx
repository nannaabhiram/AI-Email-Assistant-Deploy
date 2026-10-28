import { MailCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/ui/States'
import type { EmailListItem as EmailListItemData } from '@/lib/types'
import { EmailListItem } from './EmailListItem'

export interface EmailListProps {
  emails: EmailListItemData[] | undefined
  loading?: boolean
  error?: unknown
  onRetry?: () => void
  selectedId?: string | null
  onOpen?: (id: string) => void
  selectable?: boolean
  checkedIds?: Set<string>
  onCheckedChange?: (id: string, checked: boolean) => void
  emptyTitle?: string
  emptyDescription?: ReactNode
  label?: string
  now?: Date
}

export function EmailList({
  emails, loading, error, onRetry, selectedId, onOpen, selectable, checkedIds, onCheckedChange,
  emptyTitle = 'No emails here', emptyDescription = 'Nothing matches these filters right now.', label = 'Emails', now,
}: EmailListProps) {
  if (loading && !emails) return <LoadingSkeleton variant="list" lines={6} label="Loading emails" />
  if (error) return <ErrorState error={error} onRetry={onRetry} />
  if (!emails || emails.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} icon={<MailCheck className="h-6 w-6" aria-hidden />} />
  }
  return (
    <ul aria-label={label} aria-busy={loading || undefined} className="overflow-hidden rounded-lg border border-border bg-surface">
      {emails.map((e) => (
        <EmailListItem key={e.id} email={e} selected={selectedId === e.id} onOpen={onOpen} selectable={selectable}
          checked={checkedIds?.has(e.id)} onCheckedChange={onCheckedChange} now={now} />
      ))}
    </ul>
  )
}
