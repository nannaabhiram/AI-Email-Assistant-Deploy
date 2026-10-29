/**
 * DGX inference status: the banner and the Security page badge follow the API's `state`, so a
 * configured-but-offline tunnel is never shown as "not configured", and an available DGX shows no warning.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/components/ui/Toast'
import { ThemeProvider } from '@/hooks/useTheme'
import { configureApi } from '@/lib/api'
import { inferenceState, type InferenceState } from '@/lib/types'

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ session: { user: { id: 'u1', email: 'me@example.org' } }, signOut: async () => undefined }),
}))

const { AppShell } = await import('@/components/layout/AppShell')
const { InferenceBadge } = await import('@/pages/AccountSettingsPage')

const LLM: Record<InferenceState, object> = {
  available: { state: 'available', configured: true, reachable: true, model: 'qwen2.5vl:7b', model_available: true, latency_ms: 40, error: null, last_24h: {} },
  unreachable: { state: 'unreachable', configured: true, reachable: false, model: 'qwen2.5vl:7b', model_available: false, latency_ms: null, error: 'ConnectError: cannot reach endpoint', last_24h: {} },
  model_missing: { state: 'model_missing', configured: true, reachable: true, model: 'qwen2.5vl:7b', model_available: false, latency_ms: 30, error: null, last_24h: {} },
  not_configured: { state: 'not_configured', configured: false, reachable: false, model: null, model_available: false, latency_ms: null, error: 'LLM endpoint not configured', last_24h: {} },
}

function renderShell(state: InferenceState) {
  configureApi(async () => 'test-token', () => undefined)
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input)
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })
    if (url.includes('/system/status')) return json({ accounts: [], jobs: {}, recent_job_failures: [], llm: LLM[state] })
    if (url.includes('/me')) return json({ id: 'u1', email: 'me@example.org', display_name: null, is_demo: false, accounts: [], settings: null })
    return json({ items: [], total: 0, limit: 50, offset: 0 })
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider><ToastProvider><MemoryRouter><AppShell /></MemoryRouter></ToastProvider></ThemeProvider>
    </QueryClientProvider>,
  )
}

const banners = {
  unreachable: /DGX inference is offline/,
  model_missing: /does not serve the configured model \(qwen2\.5vl:7b\)/,
  not_configured: /No DGX inference endpoint is configured/,
}

afterEach(() => vi.restoreAllMocks())

describe('inference status banner', () => {
  it.each(['unreachable', 'model_missing', 'not_configured'] as const)('shows only the %s banner', async (state) => {
    renderShell(state)
    expect(await screen.findByText(banners[state])).toBeInTheDocument()
    for (const [other, text] of Object.entries(banners)) if (other !== state) expect(screen.queryByText(text)).toBeNull()
  })

  it('shows no inference warning when Spark 2 is available', async () => {
    renderShell('available')
    await screen.findByRole('main')
    await new Promise((r) => setTimeout(r, 50))
    for (const text of Object.values(banners)) expect(screen.queryByText(text)).toBeNull()
  })
})

describe('inference badge', () => {
  it.each([
    ['available', 'Available'], ['unreachable', 'Unreachable'], ['model_missing', 'Model not served'], ['not_configured', 'Not configured'],
  ] as const)('%s renders "%s"', (state, label) => {
    render(<InferenceBadge state={state} />)
    expect(screen.getByText(label)).toBeInTheDocument()
  })

  it('derives the state from flags for responses without `state`', () => {
    expect(inferenceState({ configured: true, reachable: false, model_available: false })).toBe('unreachable')
    expect(inferenceState({ configured: false, reachable: false, model_available: false })).toBe('not_configured')
    expect(inferenceState({ configured: true, reachable: true, model_available: true })).toBe('available')
  })
})
