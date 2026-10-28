import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface MenuItem {
  label: string
  onSelect: () => void
  icon?: ReactNode
  disabled?: boolean
  destructive?: boolean
}

export interface DropdownMenuProps {
  trigger: (props: { 'aria-haspopup': 'menu'; 'aria-expanded': boolean; 'aria-controls': string; onClick: () => void; onKeyDown: (e: React.KeyboardEvent) => void }) => ReactNode
  items: MenuItem[]
  align?: 'start' | 'end'
  label: string
}

/** WAI-ARIA menu button: arrow keys move, Enter/Space select, Escape closes and restores focus. */
export function DropdownMenu({ trigger, items, align = 'end', label }: DropdownMenuProps) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const id = useId()
  const root = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    if (!open) return
    itemRefs.current[active]?.focus()
  }, [open, active])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const enabled = items.map((it, i) => (it.disabled ? -1 : i)).filter((i) => i >= 0)
  const move = (delta: number) => {
    const pos = enabled.indexOf(active)
    const next = enabled[(pos + delta + enabled.length) % enabled.length]
    if (next !== undefined) setActive(next)
  }
  const close = () => {
    setOpen(false)
    root.current?.querySelector<HTMLElement>('[aria-haspopup="menu"]')?.focus()
  }

  return (
    <div ref={root} className="relative inline-block">
      {trigger({
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        'aria-controls': id,
        onClick: () => {
          setActive(enabled[0] ?? 0)
          setOpen((o) => !o)
        },
        onKeyDown: (e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActive(enabled[0] ?? 0)
            setOpen(true)
          }
        },
      })}
      {open && (
        <div
          id={id}
          role="menu"
          aria-label={label}
          className={cn('absolute z-40 mt-1 min-w-44 rounded-md border border-border bg-surface-raised p-1 shadow-pop', align === 'end' ? 'right-0' : 'left-0')}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); move(1) }
            if (e.key === 'ArrowUp') { e.preventDefault(); move(-1) }
            if (e.key === 'Home') { e.preventDefault(); setActive(enabled[0] ?? 0) }
            if (e.key === 'End') { e.preventDefault(); setActive(enabled[enabled.length - 1] ?? 0) }
            if (e.key === 'Escape' || e.key === 'Tab') close()
          }}
        >
          {items.map((item, i) => (
            <button
              key={item.label}
              ref={(el) => { itemRefs.current[i] = el }}
              type="button"
              role="menuitem"
              tabIndex={i === active ? 0 : -1}
              disabled={item.disabled}
              onClick={() => {
                item.onSelect()
                close()
              }}
              className={cn(
                'flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-sm hover:bg-surface-muted focus:bg-surface-muted disabled:opacity-50',
                item.destructive ? 'text-danger' : 'text-fg',
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
