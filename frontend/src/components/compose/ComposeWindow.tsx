import { ChevronDown, Maximize2, Minimize2, Send, ShieldAlert, Trash2, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { api, ApiError, errorMessage } from '@/lib/api'
import { cn } from '@/lib/cn'
import { isValidEmail } from '@/lib/recipients'
import type { ComposeDraft, ComposeMode } from './draft'
import { RecipientInput } from './RecipientInput'

export interface ComposeWindowProps {
  draft: ComposeDraft
  onChange: (draft: ComposeDraft) => void
  mode: ComposeMode
  onModeChange: (mode: ComposeMode) => void
  onClose: () => void
  onDiscard: () => void
  onSend: (draft: ComposeDraft) => Promise<void>
}

export function ComposeWindow({ draft, onChange, mode, onModeChange, onClose, onDiscard, onSend }: ComposeWindowProps) {
  const [error, setError] = useState<string | null>(null)
  const [needsPermission, setNeedsPermission] = useState(false)
  const [subjectWarned, setSubjectWarned] = useState(false)
  const [sending, setSending] = useState(false)
  const toInput = useRef<HTMLInputElement>(null)
  // Latest content, updated synchronously, so Send sees an address committed in the same keystroke or blur.
  const latest = useRef(draft)
  useLayoutEffect(() => {
    latest.current = draft
  }, [draft])
  const set = <K extends keyof ComposeDraft>(key: K, v: ComposeDraft[K]) => {
    latest.current = { ...latest.current, [key]: v }
    onChange(latest.current)
  }
  const title = draft.subject.trim() || 'New message'

  useEffect(() => {
    if (mode !== 'minimized') toInput.current?.focus({ preventScroll: true })
  }, [mode])

  const send = async () => {
    setError(null)
    const current = latest.current
    const all = [...current.to, ...current.cc, ...current.bcc]
    const invalid = all.find((r) => !isValidEmail(r.email))
    if (!all.length) return setError('Add at least one recipient.')
    if (invalid) return setError(`“${invalid.email}” is not a valid email address. Click it to fix it.`)
    if (!current.subject.trim() && !subjectWarned) {
      setSubjectWarned(true)
      return setError('This message has no subject. Press Send again to send it anyway.')
    }
    setSending(true)
    try {
      await onSend(current)
    } catch (err) {
      if (err instanceof ApiError && err.code === 'permission_upgrade_required') setNeedsPermission(true)
      else setError(errorMessage(err))
    } finally {
      setSending(false)
    }
  }

  const grantSend = async () => {
    try {
      const { authorization_url } = await api.startOAuth('send', window.location.pathname)
      window.location.assign(authorization_url)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const ccToggles = (
    <span className="flex shrink-0 gap-2 pt-1.5 text-sm text-fg-muted">
      {!draft.showCc && <button type="button" className="hover:text-fg hover:underline" onClick={() => set('showCc', true)}>Cc</button>}
      {!draft.showBcc && <button type="button" className="hover:text-fg hover:underline" onClick={() => set('showBcc', true)}>Bcc</button>}
    </span>
  )

  return (
    <>
      {mode === 'maximized' && <div className="mp-compose-scrim" aria-hidden onClick={() => onModeChange('normal')} />}
      <section
        role="dialog"
        aria-label={title}
        className="mp-compose mp-glass"
        data-mode={mode}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void send() }
          if (e.key === 'Escape' && mode === 'maximized') onModeChange('normal')
        }}
      >
        <header className="mp-compose__head">
          <button type="button" className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-fg"
            onClick={() => onModeChange(mode === 'minimized' ? 'normal' : 'minimized')}
            aria-label={mode === 'minimized' ? `Expand ${title}` : `Minimize ${title}`}>
            {title}
          </button>
          <button type="button" className="mp-compose__icon mp-compose__icon--desk" aria-label={mode === 'minimized' ? 'Expand' : 'Minimize'}
            onClick={() => onModeChange(mode === 'minimized' ? 'normal' : 'minimized')}>
            <ChevronDown className={cn('h-4 w-4 transition-transform', mode === 'minimized' && 'rotate-180')} aria-hidden />
          </button>
          <button type="button" className="mp-compose__icon mp-compose__icon--desk" aria-label={mode === 'maximized' ? 'Exit full screen' : 'Full screen'}
            onClick={() => onModeChange(mode === 'maximized' ? 'normal' : 'maximized')}>
            {mode === 'maximized' ? <Minimize2 className="h-4 w-4" aria-hidden /> : <Maximize2 className="h-4 w-4" aria-hidden />}
          </button>
          <button type="button" className="mp-compose__icon" aria-label="Save and close" onClick={onClose}>
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>

        {mode !== 'minimized' && (
          <div className="mp-compose__body">
            <RecipientInput label="To" value={draft.to} onChange={(v) => set('to', v)} inputRef={toInput}
              exclude={[...draft.cc, ...draft.bcc].map((r) => r.email)} trailing={ccToggles} />
            {draft.showCc && <RecipientInput label="Cc" value={draft.cc} onChange={(v) => set('cc', v)}
              exclude={[...draft.to, ...draft.bcc].map((r) => r.email)} />}
            {draft.showBcc && <RecipientInput label="Bcc" value={draft.bcc} onChange={(v) => set('bcc', v)}
              exclude={[...draft.to, ...draft.cc].map((r) => r.email)} />}
            <div className="mp-compose-row">
              <input aria-label="Subject" placeholder="Subject" maxLength={998}
                className="w-full bg-transparent py-1.5 text-base text-fg outline-none placeholder:text-fg-subtle sm:text-sm"
                value={draft.subject} onChange={(e) => { set('subject', e.target.value); setSubjectWarned(false) }} />
            </div>
            <textarea aria-label="Message" className="mp-compose__text" value={draft.body} maxLength={100_000}
              onChange={(e) => set('body', e.target.value)} />

            {needsPermission && (
              <div role="alert" className="mx-3 mb-2 flex flex-wrap items-center gap-2 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
                <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden />
                <span className="flex-1">MailPilot needs Gmail send permission for this account. Your message stays here.</span>
                <Button size="sm" onClick={() => void grantSend()}>Grant permission</Button>
              </div>
            )}
            {error && <p role="alert" className="mx-3 mb-2 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

            <footer className="mp-compose__foot">
              <Button loading={sending} onClick={() => void send()} leftIcon={<Send className="h-4 w-4" aria-hidden />} className="px-5">Send</Button>
              <span className="hidden text-xs text-fg-subtle sm:inline">Ctrl + Enter</span>
              <button type="button" className="mp-compose__icon ml-auto" aria-label="Discard draft" onClick={onDiscard}>
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </footer>
          </div>
        )}
      </section>
    </>
  )
}
