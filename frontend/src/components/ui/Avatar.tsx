import { Star } from 'lucide-react'
import { cn } from '@/lib/cn'
import { initials } from '@/lib/format'

const PALETTE = [
  'bg-[#e8edfc] text-[#2541a8] dark:bg-[#1f2a4a] dark:text-[#b6c6ff]',
  'bg-[#e5f4ec] text-[#16613a] dark:bg-[#15291f] dark:text-[#9fe0bb]',
  'bg-[#fdf3e2] text-[#7a4505] dark:bg-[#3a2a12] dark:text-[#f5c98a]',
  'bg-[#f3e8fb] text-[#6b2a99] dark:bg-[#2c1c3a] dark:text-[#d9b4f5]',
  'bg-[#e6f0fb] text-[#174a82] dark:bg-[#16263a] dark:text-[#a8cdf5]',
]

function hash(text: string): number {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0
  return Math.abs(h)
}

export interface AvatarProps {
  name?: string | null
  email?: string | null
  size?: 'sm' | 'md' | 'lg'
  vip?: boolean
  className?: string
}

export function Avatar({ name, email, size = 'md', vip = false, className }: AvatarProps) {
  const key = email || name || '?'
  return (
    <span className={cn('relative inline-flex shrink-0', className)} aria-hidden>
      <span
        className={cn(
          'inline-flex items-center justify-center rounded-full font-semibold',
          PALETTE[hash(key) % PALETTE.length],
          { sm: 'h-7 w-7 text-[11px]', md: 'h-9 w-9 text-xs', lg: 'h-12 w-12 text-sm' }[size],
        )}
      >
        {initials(name, email)}
      </span>
      {vip && (
        <span className="absolute -right-1 -bottom-1 rounded-full bg-surface p-0.5">
          <Star className="h-3 w-3 fill-medium text-medium" />
        </span>
      )}
    </span>
  )
}
