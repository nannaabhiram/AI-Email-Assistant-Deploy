import { describe, expect, it } from 'vitest'
import { draftSchema, splitAddresses } from '@/components/work/DraftEditor'
import { diffWords } from '@/lib/diff'
import { relativeTime } from '@/lib/format'
import { filtersFromParams } from '@/pages/InboxPage'
import { loginSchema, signupSchema } from '@/pages/LoginPage'
import { preferencesSchema } from '@/pages/PreferencesPage'
import { commitmentSchema, taskSchema } from '@/pages/TasksPage'

describe('authentication forms', () => {
  it('validates sign-in input', () => {
    expect(loginSchema.safeParse({ email: 'you@example.org', password: 'x' }).success).toBe(true)
    expect(loginSchema.safeParse({ email: 'nope', password: '' }).success).toBe(false)
  })
  it('enforces password rules and confirmation', () => {
    const issues = (v: object) => signupSchema.safeParse(v).error?.issues.map((i) => i.message) ?? []
    expect(issues({ email: 'a@example.org', password: 'short1', confirm: 'short1' })).toContain('Use at least 10 characters')
    expect(issues({ email: 'a@example.org', password: 'longpassword', confirm: 'longpassword' })).toContain('Include a number')
    expect(issues({ email: 'a@example.org', password: 'longpassw0rd', confirm: 'different0' })).toContain('Passwords do not match')
    expect(issues({ email: 'a@example.org', password: 'longpassw0rd', confirm: 'longpassw0rd' })).toEqual([])
  })
})

describe('draft form', () => {
  const base = { to: 'a@example.org', cc: '', subject: 'Re: Plan', body: 'Sounds good.' }
  it('accepts valid drafts and normalises recipient lists', () => {
    expect(draftSchema.safeParse(base).success).toBe(true)
    expect(splitAddresses('A@Example.org, b@example.org; c@example.org')).toEqual(['a@example.org', 'b@example.org', 'c@example.org'])
  })
  it('rejects missing/invalid recipients, header injection and empty bodies', () => {
    expect(draftSchema.safeParse({ ...base, to: '' }).success).toBe(false)
    expect(draftSchema.safeParse({ ...base, cc: 'bad@' }).success).toBe(false)
    expect(draftSchema.safeParse({ ...base, subject: 'Hi\r\nBcc: attacker@evil.example' }).success).toBe(false)
    expect(draftSchema.safeParse({ ...base, body: '   ' }).success).toBe(false)
  })
})

describe('tasks and preferences', () => {
  it('requires a task title and a valid date', () => {
    expect(taskSchema.safeParse({ title: '' }).success).toBe(false)
    expect(taskSchema.safeParse({ title: 'Pay invoice', due: 'not-a-date' }).success).toBe(false)
    expect(taskSchema.safeParse({ title: 'Pay invoice', due: '2026-11-01T10:00' }).success).toBe(true)
    expect(commitmentSchema.safeParse({ direction: 'sideways', description: 'x' }).success).toBe(false)
  })
  const prefs = {
    timezone: 'Asia/Kolkata', briefing_enabled: true, briefing_time: '08:00', notify_in_app: true, notify_reminders: true, notify_briefing: true,
    threshold_high: '70', threshold_medium: '40', w_deadline: '0.3', w_action: '0.25', w_impact: '0.2', w_sender: '0.15', w_context: '0.1',
    review_confidence_threshold: '0.55', auto_analyze: true, attachment_auto_extract: false, attachment_max_mb: '10', store_attachments: false,
    email_retention_days: '365', sync_lookback_days: '30', sync_max_messages: '2000', default_reply_tone: 'professional', newsletter_digest: true,
  }
  it('coerces numeric inputs and validates threshold ordering', () => {
    const ok = preferencesSchema.safeParse(prefs)
    expect(ok.success && ok.data.threshold_high).toBe(70)
    expect(preferencesSchema.safeParse({ ...prefs, threshold_medium: '80' }).error?.issues[0]?.message).toBe('Must be below the HIGH threshold')
    expect(preferencesSchema.safeParse({ ...prefs, email_retention_days: '3' }).success).toBe(false)
    expect(preferencesSchema.safeParse({ ...prefs, w_deadline: '0', w_action: '0', w_impact: '0', w_sender: '0', w_context: '0' }).success).toBe(false)
  })
})

describe('priority inbox filters', () => {
  it('maps filter chips to API parameters', () => {
    expect(filtersFromParams(['HIGH', 'MEDIUM', 'unread', 'risky'], 'invoice', 'newest', 50)).toEqual(expect.objectContaining({
      priority: ['HIGH', 'MEDIUM'], unread: true, risky: true, q: 'invoice', sort: 'newest', offset: 50, action_required: undefined,
    }))
    expect(filtersFromParams([], '', 'priority', 0).priority).toBeUndefined()
  })
})

describe('utilities', () => {
  it('diffs draft versions by word', () => {
    const parts = diffWords('I will sign today.', 'I will review today.')
    expect(parts.filter((p) => p.type === 'removed').map((p) => p.text.trim())).toEqual(['sign'])
    expect(parts.filter((p) => p.type === 'added').map((p) => p.text.trim())).toEqual(['review'])
  })
  it('formats relative times in both directions', () => {
    const now = new Date('2026-10-28T12:00:00Z')
    expect(relativeTime('2026-10-28T10:00:00Z', now)).toMatch(/2 hours ago/)
    expect(relativeTime('2026-10-30T12:00:00Z', now)).toMatch(/in 2 days/)
  })
})
