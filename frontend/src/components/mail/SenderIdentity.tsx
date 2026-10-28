import { Avatar } from '@/components/ui/Avatar'
import { cn } from '@/lib/cn'

export interface SenderIdentityProps {
  name?: string | null
  email?: string | null
  vip?: boolean
  size?: 'sm' | 'md' | 'lg'
  showEmail?: boolean
  bold?: boolean
  className?: string
}

export function SenderIdentity({ name, email, vip = false, size = 'md', showEmail = true, bold = false, className }: SenderIdentityProps) {
  const display = name?.trim() || email || 'Unknown sender'
  return (
    <div className={cn('flex min-w-0 items-center gap-2.5', className)}>
      <Avatar name={name} email={email} size={size} vip={vip} />
      <div className="min-w-0">
        <p className={cn('truncate text-sm text-fg', bold ? 'font-semibold' : 'font-medium')}>
          {display}
          {vip && <span className="sr-only"> (VIP contact)</span>}
        </p>
        {showEmail && email && name && <p className="truncate text-xs text-fg-subtle">{email}</p>}
      </div>
    </div>
  )
}
