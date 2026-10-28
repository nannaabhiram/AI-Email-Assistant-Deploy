import { ArrowDown, ArrowRight, ArrowUp, CircleHelp } from 'lucide-react'
import type { Priority } from '@/lib/types'
import { cn } from '@/lib/cn'

const STYLES: Record<Priority, { label: string; cls: string; Icon: typeof ArrowUp }> = {
  HIGH: { label: 'High', cls: 'bg-high-soft text-high border-high/30', Icon: ArrowUp },
  MEDIUM: { label: 'Medium', cls: 'bg-medium-soft text-medium border-medium/30', Icon: ArrowRight },
  LOW: { label: 'Low', cls: 'bg-low-soft text-low border-low/30', Icon: ArrowDown },
}

export interface PriorityBadgeProps {
  priority: Priority | null
  overridden?: boolean
  size?: 'sm' | 'md'
  className?: string
}

/** Priority is conveyed by text and icon shape, never by color alone. */
export function PriorityBadge({ priority, overridden = false, size = 'sm', className }: PriorityBadgeProps) {
  if (!priority) {
    return (
      <span className={cn('inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-fg-subtle', className)}>
        <CircleHelp className="h-3 w-3" aria-hidden /> Not analysed
      </span>
    )
  }
  const { label, cls, Icon } = STYLES[priority]
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-full border font-semibold', size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm', cls, className)}
      title={overridden ? `${label} priority (set by you)` : `${label} priority`}
    >
      <Icon className={size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'} aria-hidden />
      {label}
      {overridden && <span className="font-normal opacity-80">· you</span>}
      <span className="sr-only"> priority</span>
    </span>
  )
}
