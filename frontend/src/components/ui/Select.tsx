import { Check, ChevronDown } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode, type Ref, type SelectHTMLAttributes } from 'react'
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

const valueSetter = typeof window !== 'undefined' ? Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set : undefined

/**
 * Native <select> (so forms, react-hook-form and assistive tech keep working) whose
 * popup is replaced by a glass listbox. Arrow keys on the closed select still change
 * the value natively; click, tap, Enter, Space or Alt+ArrowDown open the glass list.
 */
export function Select({ label, hint, error, hideLabel, options, placeholder, id, className, required, ref, disabled, ...props }: SelectProps) {
  const autoId = useId()
  const selectId = id ?? autoId
  const listId = `${selectId}-listbox`
  const native = useRef<HTMLSelectElement | null>(null)
  const list = useRef<HTMLUListElement>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [dropUp, setDropUp] = useState(false)
  const [selectedValue, setSelectedValue] = useState<string | null>(null)

  const items = placeholder ? [{ value: '', label: placeholder }, ...options] : options
  const enabled = items.map((o, i) => ('disabled' in o && o.disabled ? -1 : i)).filter((i) => i >= 0)

  const setRefs = useCallback((el: HTMLSelectElement | null) => {
    native.current = el
    if (typeof ref === 'function') ref(el)
    else if (ref) ref.current = el
  }, [ref])

  const openList = () => {
    const el = native.current
    if (!el || disabled) return
    const current = items.findIndex((o) => o.value === el.value)
    setActive(current >= 0 ? current : enabled[0] ?? 0)
    setSelectedValue(el.value)
    const rect = el.getBoundingClientRect()
    setDropUp(window.innerHeight - rect.bottom < 280 && rect.top > window.innerHeight - rect.bottom)
    setOpen(true)
  }

  const close = (refocus = true) => {
    setOpen(false)
    if (refocus) native.current?.focus({ preventScroll: true })
  }

  const choose = (index: number) => {
    const el = native.current
    const option = items[index]
    if (!el || !option || ('disabled' in option && option.disabled)) return
    if (el.value !== option.value) {
      valueSetter?.call(el, option.value)
      el.dispatchEvent(new Event('change', { bubbles: true }))
    }
    close()
  }

  useEffect(() => {
    if (!open) return
    list.current?.focus({ preventScroll: true })
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (!list.current?.contains(target) && target !== native.current) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  useEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  const move = (delta: number) => {
    const pos = enabled.indexOf(active)
    const next = enabled[Math.min(Math.max(pos + delta, 0), enabled.length - 1)]
    if (next !== undefined) setActive(next)
  }

  const onListKey = (e: KeyboardEvent<HTMLUListElement>) => {
    const keys: Record<string, () => void> = {
      ArrowDown: () => move(1),
      ArrowUp: () => move(-1),
      Home: () => setActive(enabled[0] ?? 0),
      End: () => setActive(enabled[enabled.length - 1] ?? 0),
      Enter: () => choose(active),
      ' ': () => choose(active),
      Escape: () => close(),
    }
    if (e.key === 'Tab') return close(false)
    const action = keys[e.key]
    if (action) {
      e.preventDefault()
      action()
    }
  }

  return (
    <FieldShell id={selectId} label={label} hint={hint} error={error} required={required} hideLabel={hideLabel}>
      <div className="relative">
        <select
          ref={setRefs}
          id={selectId}
          required={required}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${selectId}-error` : hint ? `${selectId}-hint` : undefined}
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          className={cn(fieldClass, 'h-9 cursor-pointer appearance-none pr-9', className)}
          onMouseDown={(e) => {
            e.preventDefault()
            e.currentTarget.focus()
            if (open) close()
            else openList()
          }}
          onTouchEnd={(e) => {
            e.preventDefault()
            e.currentTarget.focus({ preventScroll: true })
            if (!open) openList()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ' || (e.altKey && e.key === 'ArrowDown') || e.key === 'F4') {
              e.preventDefault()
              openList()
            }
          }}
          {...props}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>
          ))}
        </select>
        <ChevronDown className={cn('pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-fg-subtle transition-transform duration-300 ease-[var(--ease-spring)]', open && 'rotate-180')} aria-hidden />
        {open && (
          <ul
            ref={list}
            id={listId}
            role="listbox"
            tabIndex={-1}
            aria-labelledby={selectId}
            aria-activedescendant={`${listId}-${active}`}
            onKeyDown={onListKey}
            className={cn('mp-listbox absolute right-0 z-50 max-h-72 min-w-full overflow-y-auto overscroll-contain p-1.5 focus:outline-none', dropUp ? 'bottom-full mb-2 origin-bottom' : 'top-full mt-2 origin-top')}
          >
            {items.map((o, i) => {
              const selected = selectedValue === o.value
              const isDisabled = 'disabled' in o && o.disabled
              return (
                <li
                  key={`${o.value}-${i}`}
                  id={`${listId}-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={selected}
                  aria-disabled={isDisabled || undefined}
                  data-active={i === active || undefined}
                  className="mp-listbox__option"
                  onPointerEnter={() => !isDisabled && setActive(i)}
                  onClick={() => choose(i)}
                >
                  <span className="truncate">{o.label}</span>
                  {selected && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </FieldShell>
  )
}
