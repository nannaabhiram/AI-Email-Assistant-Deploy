import { useId } from 'react'
import { cn } from '@/lib/cn'
import { fieldClass } from './Input'

export interface DateRange {
  from: string
  to: string
}

export interface DateRangePickerProps {
  value: DateRange
  onChange: (range: DateRange) => void
  label?: string
  presets?: { label: string; days: number }[]
  className?: string
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function rangeForDays(days: number, now: Date = new Date()): DateRange {
  const from = new Date(now)
  from.setDate(from.getDate() - days + 1)
  return { from: isoDay(from), to: isoDay(now) }
}

export function DateRangePicker({ value, onChange, label = 'Date range', presets = [{ label: '7 days', days: 7 }, { label: '30 days', days: 30 }, { label: '90 days', days: 90 }], className }: DateRangePickerProps) {
  const id = useId()
  const invalid = Boolean(value.from && value.to && value.from > value.to)
  return (
    <fieldset className={cn('flex flex-wrap items-end gap-2', className)}>
      <legend className="mb-1.5 text-sm font-medium text-fg">{label}</legend>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-from`} className="text-xs text-fg-subtle">From</label>
        <input id={`${id}-from`} type="date" value={value.from} max={value.to || undefined} aria-invalid={invalid || undefined}
          onChange={(e) => onChange({ ...value, from: e.target.value })} className={cn(fieldClass, 'h-9 w-40')} />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-to`} className="text-xs text-fg-subtle">To</label>
        <input id={`${id}-to`} type="date" value={value.to} min={value.from || undefined} aria-invalid={invalid || undefined}
          onChange={(e) => onChange({ ...value, to: e.target.value })} className={cn(fieldClass, 'h-9 w-40')} />
      </div>
      <div className="flex gap-1" role="group" aria-label="Quick ranges">
        {presets.map((p) => {
          const r = rangeForDays(p.days)
          const active = r.from === value.from && r.to === value.to
          return (
            <button key={p.days} type="button" aria-pressed={active} onClick={() => onChange(r)}
              className={cn('h-9 rounded-md border px-3 text-sm', active ? 'border-primary bg-primary-soft text-primary' : 'border-border-strong text-fg-muted hover:bg-surface-muted')}>
              {p.label}
            </button>
          )
        })}
      </div>
      {invalid && <p role="alert" className="w-full text-xs text-danger">The start date must be before the end date.</p>}
    </fieldset>
  )
}
