import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useToast } from '@/components/ui/Toast'
import { keys } from '@/hooks/queries'
import { api, ApiError, errorMessage } from '@/lib/api'
import type { Recipient } from '@/lib/recipients'
import { ComposeWindow } from './ComposeWindow'
import { ComposeContext, EMPTY_DRAFT, UNDO_SECONDS, type ComposeApi, type ComposeDraft, type ComposeMode } from './draft'
import { clearRecipientCache } from './useRecipientSuggestions'
import './compose.css'

const STORAGE_KEY = 'mailpilot-compose-draft'

type Outbox =
  | { phase: 'scheduled'; approvalId: string; sendAt: number; snapshot: ComposeDraft }
  | { phase: 'sending'; approvalId: string; snapshot: ComposeDraft }
  | { phase: 'sent' }
  | { phase: 'failed'; message: string }
  | { phase: 'undone' }
  | { phase: 'queued' }

function load(): ComposeDraft | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? { ...EMPTY_DRAFT, ...(JSON.parse(raw) as Partial<ComposeDraft>) } : null
  } catch {
    return null
  }
}

function save(draft: ComposeDraft | null): void {
  try {
    if (draft) localStorage.setItem(STORAGE_KEY, JSON.stringify(draft))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* storage unavailable (private mode); the draft just won't survive a reload */
  }
}

const hasContent = (d: ComposeDraft) => Boolean(d.to.length || d.cc.length || d.bcc.length || d.subject.trim() || d.body.trim())
const emails = (list: Recipient[]) => list.map((r) => (r.name ? `"${r.name.replace(/"/g, '')}" <${r.email}>` : r.email))

export function ComposeProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<ComposeDraft | null>(null)
  const [mode, setMode] = useState<ComposeMode>('normal')
  const [outbox, setOutbox] = useState<Outbox | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const toast = useToast()
  const qc = useQueryClient()
  const hideTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (draft && hasContent(draft)) save(draft)
  }, [draft])

  const open = useCallback<ComposeApi['open']>((prefill) => {
    setMode('normal')
    setDraft((current) => {
      if (current) return prefill ? { ...current, ...prefill } : current
      const base = prefill ? EMPTY_DRAFT : (load() ?? EMPTY_DRAFT)
      return { ...base, ...prefill, showCc: Boolean(prefill?.cc?.length) || base.showCc, showBcc: Boolean(prefill?.bcc?.length) || base.showBcc }
    })
  }, [])

  const close = () => {
    if (draft && hasContent(draft)) toast.show({ tone: 'info', title: 'Draft saved', description: 'Press Compose to continue it.' })
    setDraft(null)
  }
  const discard = () => {
    save(null)
    setDraft(null)
  }

  const finish = useCallback((next: Outbox, hideAfter = 6000) => {
    setOutbox(next)
    window.clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => setOutbox(null), hideAfter)
  }, [])

  const send = async (d: ComposeDraft) => {
    const result = await api.composeSend({
      to: emails(d.to), cc: emails(d.cc), bcc: emails(d.bcc), subject: d.subject, body: d.body, undo_seconds: UNDO_SECONDS,
    })
    save(null)
    setDraft(null)
    clearRecipientCache()
    window.clearTimeout(hideTimer.current)
    // Count down on the client clock; the server decides when it actually sends.
    setOutbox({ phase: 'scheduled', approvalId: result.approval_id, sendAt: Date.now() + UNDO_SECONDS * 1000, snapshot: d })
  }

  const undo = async () => {
    if (outbox?.phase !== 'scheduled') return
    const { approvalId, snapshot } = outbox
    try {
      await api.undoSend(approvalId)
      setDraft(snapshot)
      setMode('normal')
      finish({ phase: 'undone' }, 3000)
    } catch (err) {
      if (err instanceof ApiError && err.code === 'already_sent') toast.error('Too late to undo', 'The message is already on its way.')
      else toast.error('Could not undo', errorMessage(err))
    }
  }

  // Countdown, then follow the send until Gmail confirms it.
  useEffect(() => {
    if (outbox?.phase !== 'scheduled') return
    const t = window.setInterval(() => {
      const n = Date.now()
      setNow(n)
      if (n >= outbox.sendAt) setOutbox({ phase: 'sending', approvalId: outbox.approvalId, snapshot: outbox.snapshot })
    }, 250)
    return () => window.clearInterval(t)
  }, [outbox])

  useEffect(() => {
    if (outbox?.phase !== 'sending') return
    const { approvalId, snapshot } = outbox
    let stopped = false
    let tries = 0
    const poll = async () => {
      if (stopped) return
      tries += 1
      try {
        const a = await api.approval(approvalId)
        if (a.state === 'SUCCEEDED') {
          void qc.invalidateQueries({ queryKey: ['emails'] })
          void qc.invalidateQueries({ queryKey: keys.drafts })
          return finish({ phase: 'sent' })
        }
        if (a.state === 'FAILED' || a.state === 'CANCELLED' || a.state === 'EXPIRED') {
          setDraft((cur) => cur ?? snapshot)
          return finish({ phase: 'failed', message: a.execution?.error ?? `Sending ${a.state.toLowerCase()}` }, 12000)
        }
      } catch {
        /* transient; keep polling */
      }
      if (tries < 40) window.setTimeout(() => void poll(), 1500)
      else finish({ phase: 'queued' }, 8000) // worker is slow (e.g. the server is waking up); it still sends
    }
    const first = window.setTimeout(() => void poll(), 1200)
    return () => {
      stopped = true
      window.clearTimeout(first)
    }
  }, [outbox, qc, finish]) // outbox only changes on phase transitions

  // Gmail shortcut: "c" opens compose when not typing somewhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (e.key !== 'c' || e.ctrlKey || e.metaKey || e.altKey || el?.closest('input, textarea, select, [contenteditable="true"]')) return
      e.preventDefault()
      open()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const value = useMemo<ComposeApi>(() => ({ open, isOpen: draft !== null }), [open, draft])
  const secondsLeft = outbox?.phase === 'scheduled' ? Math.max(0, Math.ceil((outbox.sendAt - now) / 1000)) : 0

  return (
    <ComposeContext.Provider value={value}>
      {children}
      {draft && (
        <ComposeWindow draft={draft} onChange={setDraft} mode={mode} onModeChange={setMode} onClose={close} onDiscard={discard} onSend={send} />
      )}
      {outbox && (
        <div role="status" aria-live="polite" className="mp-outbox mp-glass">
          {outbox.phase === 'scheduled' && (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden />
              <span className="flex-1">Sending in {secondsLeft}s…</span>
              <button type="button" className="mp-outbox__action" onClick={() => void undo()}>Undo</button>
            </>
          )}
          {outbox.phase === 'sending' && <><Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden /><span className="flex-1">Sending…</span></>}
          {outbox.phase === 'sent' && <><CheckCircle2 className="h-4 w-4 text-success" aria-hidden /><span className="flex-1">Message sent.</span></>}
          {outbox.phase === 'undone' && <span className="flex-1">Sending undone. Your message is open again.</span>}
          {outbox.phase === 'queued' && <span className="flex-1">Still sending in the background. Check Approvals for the result.</span>}
          {outbox.phase === 'failed' && (
            <>
              <XCircle className="h-4 w-4 text-danger" aria-hidden />
              <span className="min-w-0 flex-1 truncate" title={outbox.message}>Not sent. Your message is open again.</span>
              <Link className="mp-outbox__action" to="/approvals">Details</Link>
            </>
          )}
          {outbox.phase !== 'scheduled' && outbox.phase !== 'sending' && (
            <button type="button" className="mp-outbox__close" aria-label="Dismiss" onClick={() => setOutbox(null)}>×</button>
          )}
        </div>
      )}
    </ComposeContext.Provider>
  )
}
