import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { cn } from '@/lib/cn'

export interface MetricCardProps {
  label: string
  value: number | string | null | undefined
  icon?: ReactNode
  hint?: ReactNode
  tone?: 'neutral' | 'high' | 'medium' | 'low' | 'warning' | 'success'
  href?: string
  loading?: boolean
}

const TONES = {
  neutral: 'text-fg',
  high: 'text-high',
  medium: 'text-medium',
  low: 'text-low',
  warning: 'text-warning',
  success: 'text-success',
}

export function MetricCard({ label, value, icon, hint, tone = 'neutral', href, loading }: MetricCardProps) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-fg-muted">{label}</p>
        {icon && <span className="text-fg-subtle" aria-hidden>{icon}</span>}
      </div>
      {loading ? (
        <div role="status" className="mt-2 h-8 w-16 animate-pulse rounded bg-surface-muted"><span className="sr-only">Loading {label}</span></div>
      ) : (
        <p className={cn('mt-1 text-3xl font-semibold tabular-nums', TONES[tone])}>{value ?? '—'}</p>
      )}
      {hint && <p className="mt-1 text-xs text-fg-subtle">{hint}</p>}
    </>
  )
  const cls = 'block rounded-lg border border-border bg-surface p-4 shadow-card'
  return href ? (
    <Link to={href} className={cn(cls, 'transition-colors hover:border-primary/50')} aria-label={`${label}: ${loading ? 'loading' : value ?? 'no data'}`}>{body}</Link>
  ) : (
    <div className={cls}>{body}</div>
  )
}
