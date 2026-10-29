/**
 * Generate now: the page tracks the queued job, shows progress, then refetches and shows the
 * new briefing (or the failure), and explains when the AI narrative was not available.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DailyBriefingCard } from '@/components/insights/DailyBriefingCard'
import { ToastProvider } from '@/components/ui/Toast'
import { briefing } from '@/fixtures'
import { configureApi } from '@/lib/api'
import type { Briefing } from '@/lib/types'
import BriefingsPage from '@/pages/BriefingsPage'

const ruleBased: Briefing = { ...briefing, id: 'old', source: 'rules', narrative: null, error: null }
const aiBriefing: Briefing = { ...briefing, id: 'new', source: 'hybrid', narrative: 'Fresh headline\n\nFresh narrative.', error: null }
const settings = { briefing_enabled: true, briefing_time: '08:00:00', timezone: 'UTC' }

function mockApi(jobStates: string[], lastError: string | null = null) {
  configureApi(async () => 'test-token', () => undefined)
  let generated = false
  let polls = 0
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input)
    if (url.endsWith('/briefings/generate') && init?.method === 'POST') return json({ job_id: 42, status: 'queued' }, 202)
    if (url.includes('/jobs/42')) {
      const status = jobStates[Math.min(polls++, jobStates.length - 1)]!
      if (status === 'succeeded') generated = true
      return json({ id: 42, job_type: 'generate_briefing', status, attempts: 1, max_attempts: 5, run_at: '', last_error: status === 'succeeded' ? null : lastError, created_at: '', finished_at: null })
    }
    if (url.includes('/briefings')) return json({ items: [generated ? aiBriefing : ruleBased], total: 1, limit: 14, offset: 0 })
    if (url.includes('/settings')) return json(settings)
    return json({})
  })
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><ToastProvider><MemoryRouter><BriefingsPage /></MemoryRouter></ToastProvider></QueryClientProvider>)
}

afterEach(() => vi.restoreAllMocks())

describe('Daily briefings: Generate now', () => {
  it('shows progress, then refreshes to the new AI briefing', async () => {
    const fetchSpy = mockApi(['queued', 'running', 'succeeded'])
    renderPage()
    expect(await screen.findByText('Rule-based')).toBeInTheDocument()
    expect(screen.getByText('Generated daily at 08:00 (UTC).')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Generate now' }))
    expect(await screen.findByText(/Queued\. Waiting for the background worker|Generating your briefing/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Generate now/ })).toBeDisabled() // no duplicate requests

    expect(await screen.findByText('Fresh headline', {}, { timeout: 8000 })).toBeInTheDocument()
    expect(screen.getByText('AI narrative')).toBeInTheDocument()
    expect(await screen.findByText('Briefing ready')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText(/Waiting for the background worker|Generating your briefing/)).toBeNull())
    expect(fetchSpy.mock.calls.filter(([u, i]) => String(u).endsWith('/briefings/generate') && i?.method === 'POST')).toHaveLength(1)
  }, 15_000)

  it('reports a failed generation', async () => {
    mockApi(['dead'], 'GmailError: boom')
    renderPage()
    await screen.findByText('Rule-based')
    await userEvent.click(screen.getByRole('button', { name: 'Generate now' }))
    expect(await screen.findByText('Background task failed')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate now' })).toBeEnabled() // can retry
  })
})

describe('DailyBriefingCard', () => {
  it('explains why a briefing is rule-based', () => {
    render(<MemoryRouter><DailyBriefingCard briefing={{ ...ruleBased, error: 'AI narrative unavailable (unavailable): Cannot reach inference server' }} /></MemoryRouter>)
    expect(screen.getByText('Rule-based')).toBeInTheDocument()
    expect(screen.getByText(/No AI narrative: AI narrative unavailable/)).toBeInTheDocument()
  })
})
