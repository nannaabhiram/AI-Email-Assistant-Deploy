import { SlidersHorizontal, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { cn } from '@/lib/cn'

export interface FilterOption {
  id: string
  label: string
}

export interface FilterBarProps {
  options: FilterOption[]
  active: string[]
  onChange: (active: string[]) => void
  label?: string
  sort?: { value: string; options: FilterOption[]; onChange: (v: string) => void }
  className?: string
}

/** Toggle-chip filters (aria-pressed) with a clear action and optional sort. */
export function FilterBar({ options, active, onChange, label = 'Filters', sort, className }: FilterBarProps) {
  const toggle = (id: string) => onChange(active.includes(id) ? active.filter((a) => a !== id) : [...active, id])
  return (
    <div role="toolbar" aria-label={label} className={cn('flex flex-wrap items-center gap-2', className)}>
      <SlidersHorizontal className="h-4 w-4 text-fg-subtle" aria-hidden />
      {options.map((o) => {
        const pressed = active.includes(o.id)
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={pressed}
            onClick={() => toggle(o.id)}
            className={cn(
              'h-8 rounded-full border px-3 text-sm transition-colors',
              pressed ? 'border-primary bg-primary-soft font-medium text-primary' : 'border-border-strong text-fg-muted hover:bg-surface-muted',
            )}
          >
            {o.label}
          </button>
        )
      })}
      {active.length > 0 && (
        <Button variant="ghost" size="sm" onClick={() => onChange([])} leftIcon={<X className="h-3.5 w-3.5" aria-hidden />}>Clear</Button>
      )}
      {sort && (
        <div className="ml-auto flex items-center gap-2 text-sm text-fg-muted">
          <span aria-hidden>Sort</span>
          <Select label="Sort" hideLabel value={sort.value} onChange={(e) => sort.onChange(e.target.value)}
            options={sort.options.map((o) => ({ value: o.id, label: o.label }))} className="h-8 min-w-32 rounded-full" />
        </div>
      )}
    </div>
  )
}
