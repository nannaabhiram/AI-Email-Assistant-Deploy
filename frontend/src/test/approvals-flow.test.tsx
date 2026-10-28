/**
 * Page-level flow: the Approvals page loads pending requests from the API, requires the
 * user to confirm the exact content, then posts the reviewed params_hash back.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/components/ui/Toast'
import { approvals } from '@/fixtures'
import { configureApi } from '@/lib/api'
import ApprovalsPage from '@/pages/ApprovalsPage'

function page(items: unknown[]) {
  return { items, total: items.length, limit: 50, offset: 0 }
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider><MemoryRouter><ApprovalsPage /></MemoryRouter></ToastProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => vi.restoreAllMocks())

describe('Approvals page', () => {
  it('approves exactly the reviewed send request', async () => {
    configureApi(async () => 'test-token', () => undefined)
    const pending = approvals[0]!
    const calls: { url: string; init?: RequestInit }[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      calls.push({ url, init })
      if (url.includes('/approve')) {
        return new Response(JSON.stringify({ ...pending, state: 'APPROVED', approved_at: new Date().toISOString() }), { status: 200 })
      }
      const states = new URL(url).searchParams.getAll('state')
      const body = states.includes('PENDING_APPROVAL') ? page([pending]) : page([])
      return new Response(JSON.stringify(body), { status: 200 })
    })

    renderPage()
    const card = await screen.findByRole('article', { name: /Send reply approval/ })
    const approve = within(card).getByRole('button', { name: 'Approve and send' })
    expect(approve).toBeDisabled()
    await userEvent.click(within(card).getByRole('checkbox', { name: /reviewed the exact recipients/ }))
    await userEvent.click(approve)

    await waitFor(() => expect(calls.some((c) => c.url.endsWith(`/api/v1/approvals/${pending.id}/approve`))).toBe(true))
    const call = calls.find((c) => c.url.endsWith('/approve'))!
    expect(call.init?.method).toBe('POST')
    expect(JSON.parse(String(call.init?.body))).toEqual({ params_hash: pending.params_hash })
    expect((call.init?.headers as Record<string, string>).Authorization).toBe('Bearer test-token')
    expect(await screen.findByText(/The reply is being sent/)).toBeInTheDocument()
  })

  it('shows an error state when the server is unreachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
    renderPage()
    expect(await screen.findByText('You appear to be offline')).toBeInTheDocument()
  })
})
