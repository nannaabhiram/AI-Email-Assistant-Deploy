import { cva, type VariantProps } from 'class-variance-authority'
import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

export const badgeVariants = cva('inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap', {
  variants: {
    tone: {
      neutral: 'bg-surface-muted text-fg-muted',
      primary: 'bg-primary-soft text-primary',
      success: 'bg-success-soft text-success',
      warning: 'bg-warning-soft text-warning',
      danger: 'bg-danger-soft text-danger',
      info: 'bg-info-soft text-info',
      outline: 'border border-border-strong text-fg-muted',
    },
    size: { sm: 'px-2 py-0.5 text-xs', md: 'px-2.5 py-1 text-xs' },
  },
  defaultVariants: { tone: 'neutral', size: 'sm' },
})

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  icon?: ReactNode
}

export function Badge({ tone, size, icon, className, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone, size }), className)} {...props}>
      {icon}
      {children}
    </span>
  )
}
