import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme, type ThemePreference } from '@/hooks/useTheme'
import { cn } from '@/lib/cn'

const OPTIONS: { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'Light theme', Icon: Sun },
  { value: 'dark', label: 'Dark theme', Icon: Moon },
  { value: 'system', label: 'System theme', Icon: Monitor },
]

export function ThemeToggle({ className }: { className?: string }) {
  const { preference, setPreference } = useTheme()
  return (
    <div role="radiogroup" aria-label="Color theme" className={cn('mp-glass inline-flex rounded-full border border-border bg-surface p-0.5', className)}>
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={preference === value}
          aria-label={label}
          title={label}
          onClick={() => setPreference(value)}
          className={cn('rounded-full p-1.5 transition-[background-color,color,box-shadow] duration-300 ease-[var(--ease-ios)]', preference === value ? 'bg-surface-raised text-primary shadow-[0_1px_4px_rgb(0_0_0/0.12)]' : 'text-fg-subtle hover:text-fg')}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </button>
      ))}
    </div>
  )
}
