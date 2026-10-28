import { Search, X } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { cn } from '@/lib/cn'
import { fieldClass } from './Input'

export interface SearchInputProps {
  label: string
  placeholder?: string
  defaultValue?: string
  value?: string
  onChange?: (value: string) => void
  onSubmit?: (value: string) => void
  disabled?: boolean
  className?: string
  size?: 'md' | 'lg'
}

export function SearchInput({ label, placeholder, defaultValue = '', value, onChange, onSubmit, disabled, className, size = 'md' }: SearchInputProps) {
  const id = useId()
  const [internal, setInternal] = useState(defaultValue)
  const current = value ?? internal
  const update = (v: string) => {
    if (value === undefined) setInternal(v)
    onChange?.(v)
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    onSubmit?.(current.trim())
  }
  return (
    <form role="search" onSubmit={submit} className={cn('relative w-full', className)}>
      <label htmlFor={id} className="sr-only">{label}</label>
      <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
      <input
        id={id}
        type="search"
        value={current}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => update(e.target.value)}
        className={cn(fieldClass, 'pr-9 pl-9 [&::-webkit-search-cancel-button]:hidden', size === 'lg' ? 'h-12 text-base' : 'h-9')}
      />
      {current && !disabled && (
        <button
          type="button"
          onClick={() => update('')}
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-fg-subtle hover:text-fg"
          aria-label="Clear search"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      )}
    </form>
  )
}
