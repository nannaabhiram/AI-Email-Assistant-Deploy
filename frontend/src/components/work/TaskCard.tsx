import { Bot, Check, CircleDashed, ExternalLink, Quote, Trash2, X } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { DeadlineIndicator } from '@/components/mail/DeadlineIndicator'
import { cn } from '@/lib/cn'
import { pct } from '@/lib/format'
import type { Task } from '@/lib/types'

export interface TaskCardProps {
  task: Task
  onToggleDone?: (task: Task) => void
  onConfirm?: (task: Task) => void
  onDismiss?: (task: Task) => void
  onDelete?: (task: Task) => void
  onOpenSource?: (messageId: string) => void
  busy?: boolean
  now?: Date
}

export function TaskCard({ task, onToggleDone, onConfirm, onDismiss, onDelete, onOpenSource, busy, now }: TaskCardProps) {
  const done = task.status === 'done'
  const suggested = task.status === 'suggested'
  return (
    <article
      aria-label={`Task: ${task.title}`}
      className={cn('flex gap-3 rounded-lg border bg-surface p-3', suggested ? 'border-dashed border-border-strong' : 'border-border', task.status === 'dismissed' && 'opacity-60')}
    >
      {onToggleDone && !suggested && (
        <button
          type="button"
          role="checkbox"
          aria-checked={done}
          aria-label={done ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`}
          disabled={busy}
          onClick={() => onToggleDone(task)}
          className={cn('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border', done ? 'border-success bg-success text-white' : 'border-border-strong hover:border-primary')}
        >
          {done && <Check className="h-3.5 w-3.5" aria-hidden />}
        </button>
      )}
      {suggested && <CircleDashed className="mt-0.5 h-5 w-5 shrink-0 text-fg-subtle" aria-hidden />}
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm font-medium text-fg', done && 'text-fg-subtle line-through')}>{task.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {suggested && <Badge tone="warning">Suggested — confirm</Badge>}
          {task.kind === 'reply_requested' && <Badge tone="primary">Reply requested</Badge>}
          {task.created_by !== 'user' && (
            <Badge tone="outline" icon={<Bot className="h-3 w-3" aria-hidden />}>
              {task.created_by === 'rules' ? 'Rule-detected' : 'AI-detected'}{task.confidence ? ` · ${pct(task.confidence)}` : ''}
            </Badge>
          )}
          <DeadlineIndicator dueAt={task.due_at} dateType={task.due_date_type} done={done} now={now} />
        </div>
        {task.evidence && (
          <blockquote className="mt-2 flex gap-1.5 border-l-2 border-border-strong pl-2 text-xs text-fg-muted italic">
            <Quote className="h-3 w-3 shrink-0" aria-hidden />“{task.evidence}”
          </blockquote>
        )}
        {(suggested || (task.source_message_id && onOpenSource)) && (
          <div className="mt-2 flex flex-wrap gap-2">
            {suggested && onConfirm && <Button size="sm" variant="subtle" disabled={busy} onClick={() => onConfirm(task)} leftIcon={<Check className="h-4 w-4" aria-hidden />}>Confirm task</Button>}
            {suggested && onDismiss && <Button size="sm" variant="ghost" disabled={busy} onClick={() => onDismiss(task)} leftIcon={<X className="h-4 w-4" aria-hidden />}>Dismiss</Button>}
            {task.source_message_id && onOpenSource && (
              <Button size="sm" variant="ghost" onClick={() => onOpenSource(task.source_message_id!)} leftIcon={<ExternalLink className="h-4 w-4" aria-hidden />}>Source email</Button>
            )}
          </div>
        )}
      </div>
      {onDelete && <IconButton label={`Delete task "${task.title}"`} icon={<Trash2 className="h-4 w-4" aria-hidden />} size="sm" onClick={() => onDelete(task)} disabled={busy} />}
    </article>
  )
}
