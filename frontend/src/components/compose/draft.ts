import { createContext, useContext } from 'react'
import type { Recipient } from '@/lib/recipients'

export interface ComposeDraft {
  to: Recipient[]
  cc: Recipient[]
  bcc: Recipient[]
  subject: string
  body: string
  showCc: boolean
  showBcc: boolean
}

export type ComposeMode = 'normal' | 'minimized' | 'maximized'

export const EMPTY_DRAFT: ComposeDraft = { to: [], cc: [], bcc: [], subject: '', body: '', showCc: false, showBcc: false }
export const UNDO_SECONDS = 10

export interface ComposeApi {
  open: (prefill?: Partial<Pick<ComposeDraft, 'to' | 'cc' | 'bcc' | 'subject' | 'body'>>) => void
  isOpen: boolean
}

export const ComposeContext = createContext<ComposeApi | null>(null)

export function useCompose(): ComposeApi {
  const ctx = useContext(ComposeContext)
  if (!ctx) throw new Error('useCompose must be used inside ComposeProvider')
  return ctx
}
