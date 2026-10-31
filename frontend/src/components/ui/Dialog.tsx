import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/cn'

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export interface DialogProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  /** Role "alertdialog" for confirmations that interrupt the user. */
  role?: 'dialog' | 'alertdialog'
  dismissible?: boolean
}

/** Modal dialog: focus is trapped and restored, Escape and backdrop close it. */
export function Dialog({ open, onClose, title, description, children, footer, size = 'md', role = 'dialog', dismissible = true }: DialogProps) {
  const titleId = useId()
  const descId = useId()
  const panel = useRef<HTMLDivElement>(null)
  // Keep the latest onClose without re-running the focus effect (which would steal focus on every render).
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const node = panel.current
    const first = node?.querySelector<HTMLElement>(FOCUSABLE)
    ;(first ?? node)?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) {
        e.stopPropagation()
        onCloseRef.current()
      }
      if (e.key === 'Tab' && node) {
        const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE))
        if (items.length === 0) return
        const firstItem = items[0]!
        const lastItem = items[items.length - 1]!
        if (e.shiftKey && document.activeElement === firstItem) {
          e.preventDefault()
          lastItem.focus()
        } else if (!e.shiftKey && document.activeElement === lastItem) {
          e.preventDefault()
          firstItem.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      previous?.focus?.()
    }
  }, [open, dismissible])

  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="mp-anim-fade absolute inset-0 bg-overlay backdrop-blur-sm" aria-hidden onClick={dismissible ? onClose : undefined} />
      <div
        ref={panel}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          'mp-anim-dialog relative flex max-h-[92dvh] w-full flex-col rounded-t-[1.75rem] border border-border bg-surface-raised pb-[env(safe-area-inset-bottom)] shadow-pop sm:rounded-xl sm:pb-0',
          { sm: 'sm:max-w-md', md: 'sm:max-w-lg', lg: 'sm:max-w-3xl' }[size],
        )}
      >
        <div className="mp-grabber" aria-hidden />
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 id={titleId} className="text-base font-semibold text-fg">{title}</h2>
            {description && <p id={descId} className="mt-1 text-sm text-fg-muted">{description}</p>}
          </div>
          {dismissible && (
            <button type="button" onClick={onClose} className="rounded-full bg-surface-muted p-1.5 text-fg-subtle transition-colors hover:text-fg" aria-label="Close dialog">
              <X className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>
        {children && <div className="overflow-y-auto px-5 py-4">{children}</div>}
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}
