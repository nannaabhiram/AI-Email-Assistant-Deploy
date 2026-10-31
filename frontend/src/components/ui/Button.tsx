import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'
import { cn } from '@/lib/cn'

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap select-none ' +
    'transition-[background-color,color,box-shadow,transform,opacity] duration-300 ease-[var(--ease-ios)] active:scale-[0.96] active:duration-100 ' +
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-55',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-fg shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_6px_16px_-4px_color-mix(in_srgb,var(--mp-primary)_55%,transparent)] hover:bg-primary-hover',
        secondary: 'mp-glass border border-border-strong bg-surface text-fg hover:bg-surface-raised',
        ghost: 'text-fg-muted hover:bg-surface-muted hover:text-fg',
        danger: 'bg-danger text-white hover:opacity-90 dark:text-[#1a0d0c]',
        subtle: 'bg-primary-soft text-primary hover:opacity-90',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-9 px-4 text-sm',
        lg: 'h-11 px-5 text-base',
        icon: 'h-9 w-9 p-0',
        'icon-sm': 'h-8 w-8 p-0',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  loading?: boolean
  leftIcon?: ReactNode
  ref?: Ref<HTMLButtonElement>
}

export function Button({ className, variant, size, loading = false, leftIcon, children, disabled, type = 'button', ref, ...props }: ButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : leftIcon}
      {children}
    </button>
  )
}
