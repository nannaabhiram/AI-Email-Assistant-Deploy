import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

export type ToastTone = 'success' | 'error' | 'info' | 'warning'

export interface ToastMessage {
  id: number
  tone: ToastTone
  title: string
  description?: string
}

interface ToastApi {
  show: (toast: Omit<ToastMessage, 'id'>) => void
  success: (title: string, description?: string) => void
  error: (title: string, description?: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

const ICONS = { success: CheckCircle2, error: XCircle, info: Info, warning: AlertTriangle }
const TONES = {
  success: 'border-success/40 [&_svg]:text-success',
  error: 'border-danger/40 [&_svg]:text-danger',
  info: 'border-info/40 [&_svg]:text-info',
  warning: 'border-warning/40 [&_svg]:text-warning',
}

export function Toast({ toast, onDismiss }: { toast: ToastMessage; onDismiss: () => void }) {
  const Icon = ICONS[toast.tone]
  return (
    <div
      role={toast.tone === 'error' ? 'alert' : 'status'}
      className={cn('mp-anim-toast pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border bg-surface-raised p-3 shadow-pop', TONES[toast.tone])}
    >
      <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-fg">{toast.title}</p>
        {toast.description && <p className="mt-0.5 text-sm break-words text-fg-muted">{toast.description}</p>}
      </div>
      <button type="button" onClick={onDismiss} className="rounded p-0.5 text-fg-subtle hover:text-fg" aria-label="Dismiss notification">
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  )
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const nextId = useRef(1)
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const show = useCallback(
    (toast: Omit<ToastMessage, 'id'>) => {
      const id = nextId.current++
      setToasts((t) => [...t.slice(-3), { ...toast, id }])
      window.setTimeout(() => dismiss(id), toast.tone === 'error' ? 9000 : 5000)
    },
    [dismiss],
  )
  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (title, description) => show({ tone: 'success', title, description }),
      error: (title, description) => show({ tone: 'error', title, description }),
    }),
    [show],
  )
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div aria-live="polite" className="mp-toast-region pointer-events-none fixed right-4 z-[60] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2">
        {toasts.map((t) => <Toast key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />)}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}
