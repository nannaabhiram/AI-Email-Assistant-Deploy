import { Bot, Paperclip, Reply, ShieldAlert, Sparkles } from 'lucide-react'
import type { KeyboardEvent } from 'react'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/cn'
import { relativeTime } from '@/lib/format'
import type { EmailListItem as EmailListItemData } from '@/lib/types'
import { DeadlineIndicator } from './DeadlineIndicator'
import { PriorityBadge } from './PriorityBadge'
import { SenderIdentity } from './SenderIdentity'

export interface EmailListItemProps {
  email: EmailListItemData
  selected?: boolean
  onOpen?: (id: string) => void
  selectable?: boolean
  checked?: boolean
  onCheckedChange?: (id: string, checked: boolean) => void
  now?: Date
}

export function EmailListItem({ email, selected = false, onOpen, selectable = false, checked = false, onCheckedChange, now }: EmailListItemProps) {
  const open = () => onOpen?.(email.id)
  const onKey = (e: KeyboardEvent) => {
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      open()
    }
  }
  const pending = email.analysis_status === 'pending' || email.analysis_status === 'queued'
  return (
    <li
      className={cn(
        'group relative flex gap-3 border-b border-border px-4 py-3 transition-colors focus-within:bg-surface-muted hover:bg-surface-muted',
        selected && 'bg-primary-soft hover:bg-primary-soft',
      )}
    >
      {selectable && (
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onCheckedChange?.(email.id, e.target.checked)}
          aria-label={`Select email: ${email.subject ?? 'no subject'}`}
          className="mt-2.5 h-4 w-4 shrink-0 accent-primary"
        />
      )}
      <div
        role="button"
        tabIndex={0}
        aria-current={selected || undefined}
        aria-label={`${email.is_unread ? 'Unread. ' : ''}${email.priority ? `${email.priority} priority. ` : ''}From ${email.from_name || email.from_address}. ${email.subject ?? 'No subject'}`}
        onClick={open}
        onKeyDown={onKey}
        className="min-w-0 flex-1 cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-focus"
      >
        <div className="flex items-start justify-between gap-2">
          <SenderIdentity name={email.from_name} email={email.from_address} vip={email.is_vip} showEmail={false} bold={email.is_unread} size="sm" />
          <time dateTime={email.internal_date} className="shrink-0 text-xs text-fg-subtle">{relativeTime(email.internal_date, now)}</time>
        </div>
        <p className={cn('mt-1 truncate text-sm', email.is_unread ? 'font-semibold text-fg' : 'text-fg')}>
          {email.is_unread && <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-primary align-middle" aria-hidden />}
          {email.subject || '(no subject)'}
        </p>
        <p className="mt-0.5 line-clamp-2 text-sm text-fg-muted">{email.summary || email.snippet}</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <PriorityBadge priority={email.priority} />
          {pending && <Badge tone="info" icon={<Sparkles className="h-3 w-3" aria-hidden />}>Analysing</Badge>}
          {email.analysis_source === 'rules' && <Badge tone="outline" icon={<Bot className="h-3 w-3" aria-hidden />} title="Rule-based result; AI analysis was unavailable">Rule-based</Badge>}
          {email.needs_review && <Badge tone="warning">Needs review</Badge>}
          {email.reply_needed && <Badge tone="primary" icon={<Reply className="h-3 w-3" aria-hidden />}>Reply needed</Badge>}
          {(email.risk_level === 'high' || email.risk_level === 'medium') && (
            <Badge tone="danger" icon={<ShieldAlert className="h-3 w-3" aria-hidden />}>{email.risk_level === 'high' ? 'Suspicious' : 'Caution'}</Badge>
          )}
          {email.has_attachments && <Paperclip className="h-3.5 w-3.5 text-fg-subtle" aria-label="Has attachments" />}
          <DeadlineIndicator dueAt={email.deadline_at} compact now={now} />
        </div>
      </div>
    </li>
  )
}
