import { ChevronDown } from 'lucide-react'
import { useId, type ReactNode, type Ref, type SelectHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'
import { FieldShell, fieldClass } from './Input'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  label?: ReactNode
  hint?: ReactNode
  error?: string
  hideLabel?: boolean
  options: SelectOption[]
  placeholder?: string
  ref?: Ref<HTMLSelectElement>
}

export function Select({ label, hint, error, hideLabel, options, placeholder, id, className, required, ref, ...props }: SelectProps) {
  const autoId = useId()
  const selectId = id ?? autoId
  return (
    <FieldShell id={selectId} label={label} hint={hint} error={error} required={required} hideLabel={hideLabel}>
      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${selectId}-error` : hint ? `${selectId}-hint` : undefined}
          className={cn(fieldClass, 'h-9 appearance-none pr-9', className)}
          {...props}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
      </div>
    </FieldShell>
  )
}
