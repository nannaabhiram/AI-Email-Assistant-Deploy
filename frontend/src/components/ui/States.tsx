import { AlertCircle, Inbox, RefreshCw, WifiOff } from 'lucide-react'
import type { ReactNode } from 'react'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/cn'
import { Button } from './Button'

export interface LoadingSkeletonProps {
  lines?: number
  variant?: 'text' | 'list' | 'card'
  label?: string
  className?: string
}

export function LoadingSkeleton({ lines = 3, variant = 'text', label = 'Loading', className }: LoadingSkeletonProps) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={cn('w-full', className)}>
      <span className="sr-only">{label}…</span>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className={cn('animate-pulse', variant === 'list' ? 'flex items-center gap-3 border-b border-border py-3' : 'py-1.5')}>
          {variant === 'list' && <div className="h-9 w-9 rounded-full bg-surface-muted" />}
          {variant === 'card' ? (
            <div className="h-24 rounded-lg bg-surface-muted" />
          ) : (
            <div className="flex flex-1 flex-col gap-2">
              <div className="h-3 rounded bg-surface-muted" style={{ width: `${85 - ((i * 17) % 40)}%` }} />
              {variant === 'list' && <div className="h-3 w-1/2 rounded bg-surface-muted" />}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export interface EmptyStateProps {
  title: string
  description?: ReactNode
  icon?: ReactNode
  action?: ReactNode
  className?: string
}

export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-lg border border-dashed border-border px-6 py-12 text-center', className)}>
      <div className="mb-3 rounded-full bg-surface-muted p-3 text-fg-subtle">{icon ?? <Inbox className="h-6 w-6" aria-hidden />}</div>
      <h3 className="text-sm font-semibold text-fg">{title}</h3>
      {description && <div className="mt-1 max-w-md text-sm text-fg-muted">{description}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export interface ErrorStateProps {
  error?: unknown
  title?: string
  onRetry?: () => void
  retrying?: boolean
  className?: string
}

export function ErrorState({ error, title, onRetry, retrying, className }: ErrorStateProps) {
  const apiError = error instanceof ApiError ? error : null
  const offline = apiError?.code === 'network_error'
  const forbidden = apiError?.status === 403
  const heading = title ?? (offline ? 'You appear to be offline' : forbidden ? 'Permission required' : 'Something went wrong')
  const message = error instanceof Error ? error.message : 'An unexpected error occurred.'
  return (
    <div role="alert" className={cn('flex flex-col items-center rounded-lg border border-danger/30 bg-danger-soft px-6 py-8 text-center', className)}>
      {offline ? <WifiOff className="mb-2 h-6 w-6 text-danger" aria-hidden /> : <AlertCircle className="mb-2 h-6 w-6 text-danger" aria-hidden />}
      <h3 className="text-sm font-semibold text-fg">{heading}</h3>
      <p className="mt-1 max-w-md text-sm text-fg-muted">{message}</p>
      {apiError?.requestId && <p className="mt-1 font-mono text-xs text-fg-subtle">Request ID: {apiError.requestId}</p>}
      {onRetry && (
        <Button className="mt-4" variant="secondary" size="sm" onClick={onRetry} loading={retrying} leftIcon={<RefreshCw className="h-4 w-4" aria-hidden />}>
          Try again
        </Button>
      )}
    </div>
  )
}

export function Card({ title, actions, children, className, description }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; description?: ReactNode }) {
  return (
    <section className={cn('rounded-lg border border-border bg-surface shadow-card', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div>
            {title && <h2 className="text-sm font-semibold text-fg">{title}</h2>}
            {description && <p className="text-xs text-fg-subtle">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  )
}
