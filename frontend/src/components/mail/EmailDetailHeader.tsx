import { ArrowLeft, Bot, RefreshCw, Reply, ShieldAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { formatDateTime, humanize } from '@/lib/format'
import type { EmailDetail } from '@/lib/types'
import { PriorityBadge } from './PriorityBadge'
import { SenderIdentity } from './SenderIdentity'

export interface EmailDetailHeaderProps {
  email: EmailDetail
  vip?: boolean
  onBack?: () => void
  onReply?: () => void
  onReanalyze?: () => void
  reanalyzing?: boolean
  extraActions?: ReactNode
}

export function EmailDetailHeader({ email, vip = false, onBack, onReply, onReanalyze, reanalyzing, extraActions }: EmailDetailHeaderProps) {
  const a = email.analysis
  const recipients = [...email.to_addresses, ...email.cc_addresses].map((r) => r.email).join(', ')
  return (
    <header className="space-y-3 border-b border-border pb-4">
      <div className="flex flex-wrap items-center gap-2">
        {onBack && <Button variant="ghost" size="sm" onClick={onBack} leftIcon={<ArrowLeft className="h-4 w-4" aria-hidden />}>Back</Button>}
        <div className="ml-auto flex flex-wrap gap-2">
          {extraActions}
          {onReanalyze && <Button variant="secondary" size="sm" onClick={onReanalyze} loading={reanalyzing} leftIcon={<RefreshCw className="h-4 w-4" aria-hidden />}>Re-analyse</Button>}
          {onReply && <Button size="sm" onClick={onReply} leftIcon={<Reply className="h-4 w-4" aria-hidden />}>Draft reply</Button>}
        </div>
      </div>
      <h1 className="text-xl font-semibold break-words text-fg">{email.subject || '(no subject)'}</h1>
      <div className="flex flex-wrap items-center gap-2">
        <PriorityBadge priority={a?.effective_priority ?? null} overridden={Boolean(a?.user_override_priority)} size="md" />
        {a?.category && <Badge tone="outline">{humanize(a.category)}</Badge>}
        {a?.source === 'rules' && <Badge tone="outline" icon={<Bot className="h-3 w-3" aria-hidden />}>Rule-based (AI unavailable)</Badge>}
        {a?.escalation_reason && <Badge tone="danger">Escalated: {humanize(a.escalation_reason)}</Badge>}
        {(a?.risk_level === 'high' || a?.risk_level === 'medium') && <Badge tone="danger" icon={<ShieldAlert className="h-3 w-3" aria-hidden />}>{humanize(a.risk_level)} risk</Badge>}
        {email.is_unread && <Badge tone="primary">Unread</Badge>}
      </div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SenderIdentity name={email.from_name} email={email.from_address} vip={vip} size="lg" />
        <div className="text-right text-xs text-fg-subtle">
          <time dateTime={email.internal_date}>{formatDateTime(email.internal_date)}</time>
          {recipients && <p className="mt-0.5 max-w-xs truncate" title={recipients}>To: {recipients}</p>}
          {email.reply_to && email.reply_to !== email.from_address && <p className="mt-0.5 text-warning">Reply-To: {email.reply_to}</p>}
        </div>
      </div>
    </header>
  )
}
