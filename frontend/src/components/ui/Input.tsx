import { useId, type InputHTMLAttributes, type ReactNode, type Ref, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export const fieldClass =
  'w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-fg placeholder:text-fg-subtle ' +
  'transition-[border-color,box-shadow,background-color] duration-200 focus-visible:bg-surface-raised focus-visible:shadow-[0_0_0_4px_var(--mp-primary-soft)] ' +
  'focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-60 ' +
  'aria-[invalid=true]:border-danger'

interface FieldShellProps {
  id: string
  label?: ReactNode
  hint?: ReactNode
  error?: string
  required?: boolean
  hideLabel?: boolean
  children: ReactNode
  className?: string
}

export function FieldShell({ id, label, hint, error, required, hideLabel, children, className }: FieldShellProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={id} className={cn('text-sm font-medium text-fg', hideLabel && 'sr-only')}>
          {label}
          {required && <span className="text-danger" aria-hidden> *</span>}
        </label>
      )}
      {children}
      {hint && !error && <p id={`${id}-hint`} className="text-xs text-fg-subtle">{hint}</p>}
      {error && <p id={`${id}-error`} role="alert" className="text-xs font-medium text-danger">{error}</p>}
    </div>
  )
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode
  hint?: ReactNode
  error?: string
  hideLabel?: boolean
  ref?: Ref<HTMLInputElement>
}

export function Input({ label, hint, error, hideLabel, id, className, required, ref, ...props }: InputProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  return (
    <FieldShell id={inputId} label={label} hint={hint} error={error} required={required} hideLabel={hideLabel}>
      <input
        ref={ref}
        id={inputId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
        className={cn(fieldClass, 'h-9', className)}
        {...props}
      />
    </FieldShell>
  )
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode
  hint?: ReactNode
  error?: string
  ref?: Ref<HTMLTextAreaElement>
}

export function Textarea({ label, hint, error, id, className, required, ref, ...props }: TextareaProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  return (
    <FieldShell id={inputId} label={label} hint={hint} error={error} required={required}>
      <textarea
        ref={ref}
        id={inputId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
        className={cn(fieldClass, 'min-h-24 py-2 leading-relaxed', className)}
        {...props}
      />
    </FieldShell>
  )
}
