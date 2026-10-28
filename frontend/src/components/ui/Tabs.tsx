import { useId, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface TabItem {
  id: string
  label: ReactNode
  content: ReactNode
  count?: number
}

export interface TabsProps {
  tabs: TabItem[]
  label: string
  value?: string
  defaultValue?: string
  onChange?: (id: string) => void
  className?: string
}

/** Tabs with automatic activation and arrow-key navigation (WAI-ARIA tabs pattern). */
export function Tabs({ tabs, label, value, defaultValue, onChange, className }: TabsProps) {
  const base = useId()
  const [internal, setInternal] = useState(defaultValue ?? tabs[0]?.id)
  const current = value ?? internal
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const select = (id: string) => {
    if (value === undefined) setInternal(id)
    onChange?.(id)
  }
  const onKey = (e: React.KeyboardEvent, index: number) => {
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    let next = index + delta
    if (e.key === 'Home') next = 0
    if (e.key === 'End') next = tabs.length - 1
    if (next === index && delta === 0 && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    next = (next + tabs.length) % tabs.length
    const tab = tabs[next]
    if (tab) {
      select(tab.id)
      refs.current[next]?.focus()
    }
  }
  return (
    <div className={className}>
      <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map((tab, i) => {
          const selected = tab.id === current
          return (
            <button
              key={tab.id}
              ref={(el) => { refs.current[i] = el }}
              role="tab"
              type="button"
              id={`${base}-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${base}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => select(tab.id)}
              onKeyDown={(e) => onKey(e, i)}
              className={cn(
                '-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap',
                selected ? 'border-primary text-primary' : 'border-transparent text-fg-muted hover:text-fg',
              )}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className="rounded-full bg-surface-muted px-1.5 text-xs text-fg-muted">{tab.count}</span>
              )}
            </button>
          )
        })}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`${base}-panel-${tab.id}`}
          aria-labelledby={`${base}-tab-${tab.id}`}
          hidden={tab.id !== current}
          tabIndex={0}
          className="pt-4 focus-visible:outline-none"
        >
          {tab.id === current && tab.content}
        </div>
      ))}
    </div>
  )
}
