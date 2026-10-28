import { useId, type InputHTMLAttributes, type ReactNode, type Ref } from 'react'
import { cn } from '@/lib/cn'

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode
  description?: ReactNode
  ref?: Ref<HTMLInputElement>
}

export function Checkbox({ label, description, id, className, disabled, ref, ...props }: CheckboxProps) {
  const autoId = useId()
  const boxId = id ?? autoId
  return (
    <div className={cn('flex items-start gap-3', disabled && 'opacity-60', className)}>
      <input
        ref={ref}
        id={boxId}
        type="checkbox"
        disabled={disabled}
        aria-describedby={description ? `${boxId}-desc` : undefined}
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-border-strong accent-primary disabled:cursor-not-allowed"
        {...props}
      />
      <div className="flex flex-col">
        <label htmlFor={boxId} className="cursor-pointer text-sm font-medium text-fg">{label}</label>
        {description && <p id={`${boxId}-desc`} className="text-xs text-fg-subtle">{description}</p>}
      </div>
    </div>
  )
}
