/**
 * Authentication lifecycle: error wording, password recovery, and that cached server data
 * from one user is never shown after a different user signs in.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Listener = (event: string, session: unknown) => void
const fake = vi.hoisted(() => ({
  listeners: [] as ((event: string, session: unknown) => void)[],
  session: null as unknown,
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabaseConfigured: true,
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: fake.session } }),
      refreshSession: async () => ({ data: { session: fake.session } }),
      onAuthStateChange: (cb: Listener) => {
        fake.listeners.push(cb)
        return { data: { subscription: { unsubscribe: () => undefined } } }
      },
      signInWithPassword: fake.signInWithPassword,
      signUp: fake.signUp,
      resetPasswordForEmail: fake.resetPasswordForEmail,
      updateUser: fake.updateUser,
      signOut: fake.signOut,
    },
  },
}))

const { AuthProvider, authErrorMessage, useAuth } = await import('@/hooks/useAuth')
const { SignInForm } = await import('@/pages/LoginPage')
const { resetSchema } = await import('@/pages/ResetPasswordPage')

const session = (id: string) => ({ access_token: `t-${id}`, user: { id, email: `${id}@example.org` } })

function Probe({ onReady }: { onReady: (auth: ReturnType<typeof useAuth>) => void }) {
  const auth = useAuth()
  onReady(auth)
  return <p>{auth.loading ? 'loading' : auth.session ? `user:${auth.session.user.id}` : 'signed-out'}{auth.recovering ? ' recovering' : ''}</p>
}

function renderAuth() {
  const client = new QueryClient()
  let auth!: ReturnType<typeof useAuth>
  render(<QueryClientProvider client={client}><AuthProvider><Probe onReady={(a) => { auth = a }} /></AuthProvider></QueryClientProvider>)
  return { client, auth: () => auth }
}

beforeEach(() => {
  fake.listeners = []
  fake.session = null
  vi.clearAllMocks()
})

describe('auth error messages', () => {
  it('maps Supabase errors to actionable, non-sensitive text', () => {
    expect(authErrorMessage(new Error('Invalid login credentials'))).toMatch(/Incorrect email or password.*Forgot password/)
    expect(authErrorMessage(new Error('User already registered'))).toMatch(/already exists\. Sign in instead, or reset your password/)
    expect(authErrorMessage(new TypeError('Failed to fetch'))).toMatch(/Cannot reach the authentication server/)
  })
})

describe('AuthProvider', () => {
  it('restores a persisted session and clears cached data when the user changes', async () => {
    fake.session = session('alice')
    const { client } = renderAuth()
    await screen.findByText('user:alice')
    client.setQueryData(['emails'], ['alice-mail'])

    act(() => fake.listeners.forEach((l) => l('SIGNED_IN', session('bob'))))
    await screen.findByText('user:bob')
    expect(client.getQueryData(['emails'])).toBeUndefined()
  })

  it('keeps cached data across token refreshes for the same user', async () => {
    fake.session = session('alice')
    const { client } = renderAuth()
    await screen.findByText('user:alice')
    client.setQueryData(['emails'], ['alice-mail'])
    act(() => fake.listeners.forEach((l) => l('TOKEN_REFRESHED', session('alice'))))
    expect(client.getQueryData(['emails'])).toEqual(['alice-mail'])
  })

  it('signs out locally and drops cached data', async () => {
    fake.session = session('alice')
    fake.signOut.mockResolvedValue({ error: null })
    const { client, auth } = renderAuth()
    await screen.findByText('user:alice')
    client.setQueryData(['emails'], ['alice-mail'])
    await act(() => auth().signOut())
    expect(fake.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(screen.getByText('signed-out')).toBeInTheDocument()
    expect(client.getQueryData(['emails'])).toBeUndefined()
  })

  it('rejects wrong passwords with a clear message', async () => {
    fake.signInWithPassword.mockResolvedValue({ error: new Error('Invalid login credentials') })
    const { auth } = renderAuth()
    await screen.findByText('signed-out')
    await expect(auth().signIn(' a@example.org ', 'wrong')).rejects.toThrow(/Incorrect email or password/)
    expect(fake.signInWithPassword).toHaveBeenCalledWith({ email: 'a@example.org', password: 'wrong' })
  })

  it('reports duplicate registration even when Supabase hides it', async () => {
    fake.signUp.mockResolvedValue({ data: { user: { id: 'x', identities: [] }, session: null }, error: null })
    const { auth } = renderAuth()
    await screen.findByText('signed-out')
    await expect(auth().signUp('a@example.org', 'longpassw0rd')).rejects.toThrow(/already exists/)
  })

  it('enters recovery mode from a reset link and leaves it after updating the password', async () => {
    fake.updateUser.mockResolvedValue({ error: null })
    const { auth } = renderAuth()
    await screen.findByText('signed-out')
    act(() => fake.listeners.forEach((l) => l('PASSWORD_RECOVERY', session('alice'))))
    await screen.findByText('user:alice recovering')
    await act(() => auth().updatePassword('n3w-password-ok'))
    expect(fake.updateUser).toHaveBeenCalledWith({ password: 'n3w-password-ok' })
    expect(screen.getByText('user:alice')).toBeInTheDocument()
  })
})

describe('password recovery forms', () => {
  it('sends a reset link without revealing whether the account exists', async () => {
    const onForgot = vi.fn().mockResolvedValue(undefined)
    render(<SignInForm onSubmit={vi.fn()} onMagicLink={vi.fn()} onForgotPassword={onForgot} />)
    await userEvent.click(screen.getByRole('button', { name: 'Forgot password?' }))
    expect(onForgot).not.toHaveBeenCalled() // email is required first
    await userEvent.type(screen.getByLabelText(/Email/), 'me@example.org')
    await userEvent.click(screen.getByRole('button', { name: 'Forgot password?' }))
    await waitFor(() => expect(onForgot).toHaveBeenCalledWith('me@example.org'))
    expect(await screen.findByRole('status')).toHaveTextContent('If an account exists for this email')
  })

  it('validates the new password', () => {
    expect(resetSchema.safeParse({ password: 'longpassw0rd', confirm: 'longpassw0rd' }).success).toBe(true)
    expect(resetSchema.safeParse({ password: 'longpassw0rd', confirm: 'other0000000' }).success).toBe(false)
    expect(resetSchema.safeParse({ password: 'short1', confirm: 'short1' }).success).toBe(false)
  })
})
