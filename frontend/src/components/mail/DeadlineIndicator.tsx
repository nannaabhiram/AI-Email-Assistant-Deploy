import { AlarmClock, CalendarClock, CalendarX2 } from 'lucide-react'
import { cn } from '@/lib/cn'
import { formatDateTime, relativeTime } from '@/lib/format'
import type { DateKind } from '@/lib/types'

export interface DeadlineIndicatorProps {
  dueAt: string | null
  dateType?: DateKind
  text?: string | null
  done?: boolean
  now?: Date
  compact?: boolean
  className?: string
}

export function deadlineState(dueAt: string, now: Date = new Date()): 'overdue' | 'soon' | 'upcoming' {
  const diff = new Date(dueAt).getTime() - now.getTime()
  if (diff < 0) return 'overdue'
  if (diff < 24 * 3600 * 1000) return 'soon'
  return 'upcoming'
}

export function DeadlineIndicator({ dueAt, dateType = 'explicit', text, done = false, now, compact = false, className }: DeadlineIndicatorProps) {
  if (!dueAt) return null
  const state = done ? 'upcoming' : deadlineState(dueAt, now)
  const Icon = state === 'overdue' ? CalendarX2 : state === 'soon' ? AlarmClock : CalendarClock
  const label = state === 'overdue' ? 'Overdue' : state === 'soon' ? 'Due soon' : 'Due'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs font-medium',
        done ? 'text-fg-subtle line-through' : state === 'overdue' ? 'text-danger' : state === 'soon' ? 'text-warning' : 'text-fg-muted',
        className,
      )}
      title={`${label}: ${formatDateTime(dueAt)}${text ? ` (“${text}”)` : ''}`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>
        {label} {relativeTime(dueAt, now)}
        {!compact && dateType === 'inferred' && <span className="ml-1 rounded bg-warning-soft px-1 text-warning">inferred</span>}
      </span>
    </span>
  )
}
