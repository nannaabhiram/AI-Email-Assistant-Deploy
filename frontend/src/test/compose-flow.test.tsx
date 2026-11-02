/**
 * Compose flow: recipient autocomplete as you type, chips, send with an undo window, undo reopens the message.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ComposeProvider } from '@/components/compose/ComposeProvider'
import { useCompose } from '@/components/compose/draft'
import { clearRecipientCache } from '@/components/compose/useRecipientSuggestions'
import { ToastProvider } from '@/components/ui/Toast'
import { configureApi } from '@/lib/api'

function Launcher() {
  const compose = useCompose()
  return <button type="button" onClick={() => compose.open()}>Open compose</button>
}

function renderCompose() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider><MemoryRouter><ComposeProvider><Launcher /></ComposeProvider></MemoryRouter></ToastProvider>
    </QueryClientProvider>,
  )
}

const suggestion = {
  email: 'nanna.abhiram@klh.edu.in', name: 'Nanna Abhiram', is_vip: false, sent_count: 4, received_count: 9,
  last_contacted_at: new Date(Date.now() - 86_400_000).toISOString(),
}

afterEach(() => {
  vi.restoreAllMocks()
  clearRecipientCache()
  localStorage.clear()
})

describe('Compose', () => {
  it('suggests recipients while typing, sends with undo, and undo reopens the message', async () => {
    configureApi(async () => 'test-token', () => undefined)
    const calls: { url: string; init?: RequestInit }[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      calls.push({ url, init })
      if (url.includes('/compose/recipients')) return new Response(JSON.stringify({ items: [suggestion], total: 1 }))
      if (url.endsWith('/compose/send')) {
        return new Response(JSON.stringify({ approval_id: 'ap-1', draft_id: 'd-1', state: 'APPROVED', send_at: new Date().toISOString() }), { status: 202 })
      }
      if (url.endsWith('/compose/ap-1/undo')) return new Response(JSON.stringify({ id: 'd-1', status: 'discarded' }))
      return new Response('{}', { status: 404 })
    })
    const user = userEvent.setup()
    renderCompose()
    await user.click(screen.getByRole('button', { name: 'Open compose' }))

    const to = screen.getByRole('combobox', { name: 'To' })
    await user.type(to, 'nanna.ab')
    const option = await screen.findByRole('option', { name: /Nanna Abhiram/ })
    expect(option).toHaveTextContent('You emailed 4×')
    expect(screen.getByText(/1 match/)).toBeInTheDocument()
    const recipientCalls = calls.filter((c) => c.url.includes('/compose/recipients'))
    expect(new URL(recipientCalls.at(-1)!.url).searchParams.get('q')).toBe('nanna.ab')

    await user.keyboard('{Enter}')
    expect(screen.getByRole('button', { name: 'Edit nanna.abhiram@klh.edu.in' })).toHaveTextContent('Nanna Abhiram')
    // Longer queries are answered from the cached complete result, without another request.
    const before = calls.length
    await user.type(to, 'nanna.abhi')
    await screen.findByText(/1 match/).catch(() => undefined)
    expect(calls.length).toBe(before)
    await user.clear(to)

    await user.click(screen.getByRole('button', { name: 'Bcc' }))
    await user.type(screen.getByRole('combobox', { name: 'Bcc' }), 'boss@example.org,')
    await user.type(screen.getByRole('textbox', { name: 'Subject' }), 'Project update')
    await user.type(screen.getByRole('textbox', { name: 'Message' }), 'Hi Abhiram, all set.')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    expect(await screen.findByText(/Sending in \d+s/)).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const sent = calls.find((c) => c.url.endsWith('/compose/send'))!
    expect(JSON.parse(String(sent.init?.body))).toEqual({
      to: ['"Nanna Abhiram" <nanna.abhiram@klh.edu.in>'], cc: [], bcc: ['boss@example.org'],
      subject: 'Project update', body: 'Hi Abhiram, all set.', undo_seconds: 10,
    })

    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Project update' })).toBeInTheDocument())
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('Hi Abhiram, all set.')
    expect(screen.getByText(/Sending undone/)).toBeInTheDocument()
  })

  it('blocks invalid addresses and asks for send permission when missing', async () => {
    configureApi(async () => 'test-token', () => undefined)
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/compose/recipients')) return new Response(JSON.stringify({ items: [], total: 0 }))
      return new Response(JSON.stringify({ error: { code: 'permission_upgrade_required', message: 'Sending requires granting Gmail send permission' } }), { status: 403 })
    })
    const user = userEvent.setup()
    renderCompose()
    await user.click(screen.getByRole('button', { name: 'Open compose' }))
    await user.type(screen.getByRole('combobox', { name: 'To' }), 'nanna.abhiram{Enter}')
    await user.type(screen.getByRole('textbox', { name: 'Subject' }), 'Hi')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByText(/not a valid email address/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Remove nanna.abhiram' }))
    await user.type(screen.getByRole('combobox', { name: 'To' }), 'nanna.abhiram@klh.edu.in{Enter}')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByRole('button', { name: 'Grant permission' })).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
