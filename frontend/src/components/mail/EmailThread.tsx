import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/cn'
import { formatDateTime } from '@/lib/format'
import type { EmailDetail } from '@/lib/types'
import { SenderIdentity } from './SenderIdentity'

export interface EmailThreadProps {
  messages: EmailDetail[]
  currentId?: string
  onSelect?: (id: string) => void
}

export function EmailThread({ messages, currentId, onSelect }: EmailThreadProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(currentId ? [currentId] : messages.slice(-1).map((m) => m.id)))
  const toggle = (id: string) => setExpanded((s) => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    return n
  })
  return (
    <ol aria-label="Conversation" className="space-y-2">
      {messages.map((m) => {
        const open = expanded.has(m.id)
        return (
          <li key={m.id} className={cn('rounded-lg border bg-surface', m.id === currentId ? 'border-primary/50' : 'border-border')}>
            <button
              type="button"
              aria-expanded={open}
              onClick={() => toggle(m.id)}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
            >
              {open ? <ChevronDown className="h-4 w-4 shrink-0 text-fg-subtle" aria-hidden /> : <ChevronRight className="h-4 w-4 shrink-0 text-fg-subtle" aria-hidden />}
              <SenderIdentity name={m.is_sent ? 'You' : m.from_name} email={m.from_address} showEmail={false} size="sm" className="flex-1" />
              <time dateTime={m.internal_date} className="shrink-0 text-xs text-fg-subtle">{formatDateTime(m.internal_date)}</time>
            </button>
            {open ? (
              <div className="border-t border-border px-4 py-3">
                <pre className="font-sans text-sm leading-relaxed break-words whitespace-pre-wrap text-fg">{m.body_text || '(empty)'}</pre>
                {onSelect && m.id !== currentId && (
                  <button type="button" className="mt-2 text-xs font-medium text-primary hover:underline" onClick={() => onSelect(m.id)}>Open this message</button>
                )}
              </div>
            ) : (
              <p className="truncate px-10 pb-2.5 text-sm text-fg-muted">{m.body_text?.slice(0, 160)}</p>
            )}
          </li>
        )
      })}
    </ol>
  )
}
