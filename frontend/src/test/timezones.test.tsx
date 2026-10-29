/**
 * Timezone selector: browsers list India as the legacy CLDR alias "Asia/Calcutta" and omit "UTC",
 * so the raw Intl list could neither offer Asia/Kolkata nor show a saved UTC value.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/components/ui/Toast'
import { ThemeProvider } from '@/hooks/useTheme'
import { configureApi } from '@/lib/api'
import { canonicalTimezone, timezoneOptions, utcOffset } from '@/lib/timezones'
import type { Settings } from '@/lib/types'
import PreferencesPage from '@/pages/PreferencesPage'

describe('timezone options', () => {
  it('replaces legacy browser names with IANA identifiers and adds UTC', () => {
    const opts = timezoneOptions(null, ['Asia/Calcutta', 'Europe/Kiev', 'Europe/London'])
    expect(opts.map((o) => o.value)).toEqual(['UTC', 'Asia/Kolkata', 'Europe/Kyiv', 'Europe/London'])
    expect(opts.find((o) => o.value === 'Asia/Kolkata')?.label).toBe('Asia/Kolkata (UTC+05:30)')
  })

  it('offers Asia/Kolkata from the real browser list', () => {
    const values = timezoneOptions().map((o) => o.value)
    expect(values).toContain('Asia/Kolkata')
    expect(values).not.toContain('Asia/Calcutta')
    expect(values).toContain('UTC')
  })

  it('always includes the saved value so it is never silently replaced', () => {
    expect(timezoneOptions('Etc/GMT-3', ['Europe/London']).map((o) => o.value)).toContain('Etc/GMT-3')
    expect(canonicalTimezone('Asia/Calcutta')).toBe('Asia/Kolkata')
  })

  it('India stays at UTC+05:30 all year', () => {
    expect(utcOffset('Asia/Kolkata', new Date('2027-01-15T00:00:00Z'))).toBe('UTC+05:30')
    expect(utcOffset('Asia/Kolkata', new Date('2027-07-15T00:00:00Z'))).toBe('UTC+05:30')
    expect(utcOffset('America/New_York', new Date('2027-07-15T00:00:00Z'))).toBe('UTC-04:00')
  })
})

const base: Settings = {
  timezone: 'UTC', briefing_enabled: true, briefing_time: '08:00:00',
  notification_prefs: { in_app: true, reminders: true, briefing: true },
  priority_thresholds: { high: 70, medium: 40 },
  scoring_weights: { deadline: 0.3, action: 0.25, impact: 0.2, sender: 0.15, context: 0.1 },
  review_confidence_threshold: 0.6, auto_analyze: true, attachment_auto_extract: false, attachment_max_bytes: 10 * 1048576,
  store_attachments: false, email_retention_days: 365, sync_lookback_days: 30, sync_max_messages: 2000,
  default_reply_tone: 'professional', newsletter_digest: true, version: 3,
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}><ThemeProvider><ToastProvider><MemoryRouter><PreferencesPage /></MemoryRouter></ToastProvider></ThemeProvider></QueryClientProvider>,
  )
}

afterEach(() => vi.restoreAllMocks())

describe('Preferences timezone', () => {
  it('shows the saved UTC, lets the user pick Asia/Kolkata, saves it and shows it after a reload', async () => {
    configureApi(async () => 'test-token', () => undefined)
    let stored: Settings = { ...base }
    const patches: Record<string, unknown>[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (String(input).includes('/settings')) {
        if (init?.method === 'PATCH') {
          const body = JSON.parse(String(init.body)) as Partial<Settings>
          patches.push(body)
          stored = { ...stored, ...body, version: stored.version + 1 }
        }
        return new Response(JSON.stringify(stored), { status: 200 })
      }
      return new Response('{}', { status: 200 })
    })

    const first = renderPage()
    const select = await screen.findByRole('combobox', { name: /Timezone/ })
    expect(select).toHaveValue('UTC') // not silently shown as the first list entry
    await userEvent.selectOptions(select, 'Asia/Kolkata')
    expect(screen.getByRole('option', { name: 'Asia/Kolkata (UTC+05:30)' })).toHaveProperty('selected', true)
    await userEvent.click(screen.getByRole('button', { name: 'Save preferences' }))
    await waitFor(() => expect(patches).toHaveLength(1))
    expect(patches[0]).toMatchObject({ timezone: 'Asia/Kolkata', briefing_time: '08:00:00', version: 3 })
    first.unmount()

    renderPage() // a page refresh reads the stored value back
    expect(await screen.findByRole('combobox', { name: /Timezone/ })).toHaveValue('Asia/Kolkata')
  })
})
