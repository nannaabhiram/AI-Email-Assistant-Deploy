import type { CSSProperties } from 'react'
import { cn } from '@/lib/cn'

export interface KineticTextProps {
  text: string
  /** Start time in seconds. */
  delay?: number
  /** Seconds between letters. */
  stagger?: number
  variant?: 'flip' | 'rise' | 'blur'
  className?: string
}

/** Letter-by-letter kinetic typography. Screen readers get the plain string. */
export function KineticText({ text, delay = 0, stagger = 0.035, variant = 'flip', className }: KineticTextProps) {
  let index = 0
  return (
    <span className={cn('mp-kinetic', `mp-kinetic--${variant}`, className)}>
      <span className="sr-only">{text}</span>
      {text.split(' ').map((word, w) => (
        <span key={w} className="mp-kinetic__word" aria-hidden>
          {Array.from(word).map((ch) => {
            const i = index++
            return (
              <span key={i} className="mp-kinetic__char" style={{ '--i': i, '--d': `${delay}s`, '--s': `${stagger}s` } as CSSProperties}>
                {ch}
              </span>
            )
          })}
        </span>
      ))}
    </span>
  )
}
