import type { Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { configureApi } from '@/lib/api'
import { supabase } from '@/lib/supabase'

interface AuthContextValue {
  session: Session | null
  loading: boolean
  /** True after the user followed a password-reset link and must choose a new password. */
  recovering: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<{ needsConfirmation: boolean }>
  sendMagicLink: (email: string) => Promise<void>
  sendPasswordReset: (email: string) => Promise<void>
  updatePassword: (password: string) => Promise<void>
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function client() {
  if (!supabase) throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.')
  return supabase
}

/** Supabase error messages are generic already; map the common ones to actionable text. */
export function authErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  if (/invalid login credentials/i.test(raw)) return 'Incorrect email or password. If you have forgotten it, use “Forgot password?”.'
  if (/user already registered/i.test(raw)) return 'An account with this email already exists. Sign in instead, or reset your password.'
  if (/email not confirmed/i.test(raw)) return 'Confirm your email address first. Check your inbox for the confirmation link.'
  if (/failed to fetch|networkerror|load failed/i.test(raw)) return 'Cannot reach the authentication server. Check that Supabase is running.'
  if (/rate limit|too many/i.test(raw)) return 'Too many attempts. Wait a minute and try again.'
  return raw
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(Boolean(supabase))
  const [recovering, setRecovering] = useState(false)
  const userId = useRef<string | null | undefined>(undefined)

  useEffect(() => {
    if (!supabase) return
    const sb = supabase
    // Cached server data belongs to one user: drop it whenever the signed-in user changes,
    // so a previous account's mailbox can never be shown to the next one.
    const apply = (next: Session | null) => {
      const nextId = next?.user.id ?? null
      if (userId.current !== undefined && userId.current !== nextId) queryClient.clear()
      userId.current = nextId
      setSession(next)
    }
    configureApi(
      async () => (await sb.auth.getSession()).data.session?.access_token ?? null,
      () => void sb.auth.refreshSession().then(({ data }) => { if (!data.session) apply(null) }),
    )
    sb.auth.getSession().then(({ data }) => {
      apply(data.session)
      setLoading(false)
    })
    const { data } = sb.auth.onAuthStateChange((event, next) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      apply(next)
    })
    return () => data.subscription.unsubscribe()
  }, [queryClient])

  const value = useMemo<AuthContextValue>(() => ({
    session,
    loading,
    recovering,
    async signIn(email, password) {
      const { error } = await client().auth.signInWithPassword({ email: email.trim(), password })
      if (error) throw new Error(authErrorMessage(error))
    },
    async signUp(email, password) {
      const { data, error } = await client().auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: `${window.location.origin}/onboarding` } })
      if (error) throw new Error(authErrorMessage(error))
      // With email confirmation on, Supabase hides existing accounts by returning a user with no identities.
      if (data.user && data.user.identities?.length === 0) throw new Error(authErrorMessage('User already registered'))
      return { needsConfirmation: !data.session }
    },
    async sendMagicLink(email) {
      const { error } = await client().auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/dashboard` } })
      if (error) throw new Error(authErrorMessage(error))
    },
    async sendPasswordReset(email) {
      const { error } = await client().auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` })
      if (error) throw new Error(authErrorMessage(error))
    },
    async updatePassword(password) {
      const { error } = await client().auth.updateUser({ password })
      if (error) throw new Error(authErrorMessage(error))
      setRecovering(false)
    },
    async signInWithGoogle() {
      const { error } = await client().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/dashboard` } })
      if (error) throw new Error(authErrorMessage(error))
    },
    async signOut() {
      // 'local' always clears this browser's session, even if the server is unreachable.
      await client().auth.signOut({ scope: 'local' })
      queryClient.clear()
      userId.current = null
      setRecovering(false)
      setSession(null)
    },
  }), [session, loading, recovering, queryClient])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
