import { Loader2, X } from 'lucide-react'
import { useId, useRef, useState, type ClipboardEvent, type KeyboardEvent, type ReactNode } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { cn } from '@/lib/cn'
import { relativeTime } from '@/lib/format'
import { dedupe, highlight, isValidEmail, parseRecipientList, type Recipient } from '@/lib/recipients'
import type { RecipientSuggestion } from '@/lib/types'
import { useRecipientSuggestions } from './useRecipientSuggestions'

export interface RecipientInputProps {
  label: string
  value: Recipient[]
  onChange: (next: Recipient[]) => void
  /** Addresses already used in the other fields, hidden from suggestions. */
  exclude?: string[]
  autoFocus?: boolean
  trailing?: ReactNode
  inputRef?: React.Ref<HTMLInputElement>
}

function Highlighted({ text, query }: { text: string; query: string }) {
  const [a, b, c] = highlight(text, query)
  return <>{a}{b && <mark className="bg-transparent font-semibold text-fg">{b}</mark>}{c}</>
}

function usageLine(s: RecipientSuggestion): string {
  const parts: string[] = []
  if (s.sent_count) parts.push(`You emailed ${s.sent_count}×`)
  else if (s.received_count) parts.push(`Emailed you ${s.received_count}×`)
  if (s.last_contacted_at) parts.push(relativeTime(s.last_contacted_at))
  return parts.join(' · ')
}

export function RecipientInput({ label, value, onChange, exclude = [], autoFocus, trailing, inputRef }: RecipientInputProps) {
  const id = useId()
  const listId = `${id}-list`
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const blurTimer = useRef<number | undefined>(undefined)
  const { items, total, loading, query } = useRecipientSuggestions(open ? text : '')
  const taken = new Set([...value.map((r) => r.email), ...exclude])
  const suggestions = items.filter((s) => !taken.has(s.email))
  const showList = open && text.trim().length > 0 && (suggestions.length > 0 || loading)

  const add = (list: Recipient[]) => {
    if (list.length) onChange(dedupe([...value, ...list]))
  }
  const pick = (s: RecipientSuggestion) => {
    add([{ email: s.email, name: s.name }])
    setText('')
    setActive(0)
  }
  const commitText = (): boolean => {
    const parsed = parseRecipientList(text)
    if (!parsed.length) return false
    add(parsed)
    setText('')
    return true
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (showList && suggestions.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (i + 1) % suggestions.length); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (i - 1 + suggestions.length) % suggestions.length); return }
      if ((e.key === 'Enter' || e.key === 'Tab') && suggestions[active]) {
        e.preventDefault()
        pick(suggestions[active]!)
        return
      }
    }
    if (e.key === 'Escape' && showList) { e.preventDefault(); e.stopPropagation(); setOpen(false); return }
    if ((e.key === 'Enter' || e.key === ',' || e.key === ';' || (e.key === 'Tab' && text.trim())) && text.trim()) {
      if (commitText()) e.preventDefault()
      return
    }
    if (e.key === ' ' && isValidEmail(text.trim())) { e.preventDefault(); commitText(); return }
    if (e.key === 'Backspace' && !text && value.length) {
      e.preventDefault()
      const last = value[value.length - 1]
      onChange(value.slice(0, -1))
      setText(last?.email ?? '')
    }
  }

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text')
    if (/[,;\n]/.test(pasted) || (pasted.match(/@/g)?.length ?? 0) > 1) {
      e.preventDefault()
      add(parseRecipientList(pasted))
    }
  }

  return (
    <div className="mp-compose-row relative">
      <label htmlFor={id} className="w-10 shrink-0 pt-1.5 text-sm text-fg-subtle">{label}</label>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
        {value.map((r, i) => {
          const valid = isValidEmail(r.email)
          return (
            <span
              key={r.email}
              title={r.name ? `${r.name} <${r.email}>` : r.email}
              className={cn('mp-chip', !valid && 'mp-chip--invalid')}
            >
              <Avatar name={r.name} email={r.email} size="sm" className="mp-chip__avatar" />
              <button
                type="button"
                className="max-w-[14rem] truncate"
                onClick={() => { onChange(value.filter((_, j) => j !== i)); setText(r.name ? `${r.name} <${r.email}>` : r.email) }}
                aria-label={`Edit ${r.email}`}
              >
                {r.name || r.email}
              </button>
              <button type="button" className="mp-chip__x" aria-label={`Remove ${r.email}`} onClick={() => onChange(value.filter((_, j) => j !== i))}>
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </span>
          )
        })}
        <input
          id={id}
          ref={inputRef}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && suggestions[active] ? `${listId}-${active}` : undefined}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          inputMode="email"
          autoFocus={autoFocus}
          className="min-w-[8rem] flex-1 bg-transparent py-1.5 text-base text-fg outline-none placeholder:text-fg-subtle sm:text-sm"
          value={text}
          onChange={(e) => { setText(e.target.value); setOpen(true); setActive(0) }}
          onFocus={() => { window.clearTimeout(blurTimer.current); setOpen(true) }}
          onBlur={() => {
            if (text.includes('@')) commitText()
            blurTimer.current = window.setTimeout(() => setOpen(false), 120)
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
        />
      </div>
      {trailing}
      {showList && (
        <div className="mp-suggest mp-glass" onMouseDown={(e) => e.preventDefault()}>
          <p className="flex items-center gap-2 px-3 pt-2 pb-1 text-xs text-fg-subtle">
            {loading && !suggestions.length ? <><Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Searching contacts…</> :
              `${total} ${total === 1 ? 'match' : 'matches'}${total > suggestions.length ? `, top ${suggestions.length}` : ''} · most used first`}
          </p>
          <ul id={listId} role="listbox" aria-label={`${label} suggestions`} className="max-h-72 overflow-y-auto pb-1">
            {suggestions.map((s, i) => (
              <li
                key={s.email}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={cn('mp-suggest__item', i === active && 'mp-suggest__item--active')}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(s)}
              >
                <Avatar name={s.name} email={s.email} size="md" vip={s.is_vip} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-fg"><Highlighted text={s.name || s.email} query={query} /></span>
                  {s.name && <span className="block truncate text-xs text-fg-muted"><Highlighted text={s.email} query={query} /></span>}
                </span>
                <span className="hidden shrink-0 text-xs text-fg-subtle sm:block">{usageLine(s)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

