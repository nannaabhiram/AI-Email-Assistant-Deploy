import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from './Button'

export interface PaginationProps {
  total: number
  limit: number
  offset: number
  onChange: (offset: number) => void
  disabled?: boolean
}

export function Pagination({ total, limit, offset, onChange, disabled }: PaginationProps) {
  if (total <= limit && offset === 0) return null
  const page = Math.floor(offset / limit) + 1
  const pages = Math.max(1, Math.ceil(total / limit))
  const from = total === 0 ? 0 : offset + 1
  const to = Math.min(offset + limit, total)
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 py-3 text-sm text-fg-muted">
      <p aria-live="polite">
        Showing <span className="font-medium text-fg">{from}–{to}</span> of <span className="font-medium text-fg">{total}</span>
      </p>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" leftIcon={<ChevronLeft className="h-4 w-4" aria-hidden />}
          disabled={disabled || offset === 0} onClick={() => onChange(Math.max(0, offset - limit))}>
          Previous
        </Button>
        <span className="hidden sm:inline">Page {page} of {pages}</span>
        <Button variant="secondary" size="sm" disabled={disabled || offset + limit >= total} onClick={() => onChange(offset + limit)}>
          Next <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </nav>
  )
}
