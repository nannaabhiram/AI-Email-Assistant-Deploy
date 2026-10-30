import { zodResolver } from '@hookform/resolvers/zod'
import { KeyRound, Mail, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { z } from 'zod'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { useAuth } from '@/hooks/useAuth'
import { errorMessage } from '@/lib/api'

export const loginSchema = z.object({
  email: z.email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
})

type LoginValues = z.infer<typeof loginSchema>

export function SignInForm({ onSubmit, onMagicLink, onForgotPassword }: {
  onSubmit: (v: LoginValues) => Promise<void>
  onMagicLink: (email: string) => Promise<void>
  onForgotPassword?: (email: string) => Promise<void>
}) {
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const { register, handleSubmit, getValues, trigger, formState: { errors, isSubmitting } } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) })
  const submit = handleSubmit(async (v) => {
    setError(null)
    try {
      await onSubmit(v)
    } catch (e) {
      setError(errorMessage(e))
    }
  })
  const magic = async () => {
    if (!(await trigger('email'))) return
    setError(null)
    try {
      await onMagicLink(getValues('email'))
      setInfo('If an account exists for this email, a sign-in link is on its way.')
    } catch (e) {
      setError(errorMessage(e))
    }
  }
  const forgot = async () => {
    if (!onForgotPassword || !(await trigger('email'))) return
    setError(null)
    try {
      await onForgotPassword(getValues('email'))
      // Same message whether or not the account exists, so the form does not reveal registered emails.
      setInfo('If an account exists for this email, a password reset link is on its way.')
    } catch (e) {
      setError(errorMessage(e))
    }
  }
  return (
    <form onSubmit={submit} noValidate className="space-y-4" aria-label="Sign in">
      <Input label="Email" type="email" autoComplete="email" required error={errors.email?.message} {...register('email')} />
      <Input label="Password" type="password" autoComplete="current-password" required error={errors.password?.message} {...register('password')} />
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {info && <p role="status" className="text-sm text-success">{info}</p>}
      <Button type="submit" className="w-full" loading={isSubmitting}>Sign in</Button>
      <Button type="button" variant="ghost" className="w-full" onClick={magic} leftIcon={<Mail className="h-4 w-4" aria-hidden />}>Email me a sign-in link</Button>
      {onForgotPassword && <Button type="button" variant="ghost" className="w-full" onClick={forgot} leftIcon={<KeyRound className="h-4 w-4" aria-hidden />}>Forgot password?</Button>}
    </form>
  )
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}

export default function LoginPage() {
  const { session, recovering, signIn, signInWithGoogle, sendMagicLink, sendPasswordReset } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard'
  const [redirecting, setRedirecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showEmail, setShowEmail] = useState(false)
  if (session) return <Navigate to={recovering ? '/reset-password' : from} replace />
  const google = async () => {
    setError(null)
    setRedirecting(true)
    try {
      await signInWithGoogle(from)
    } catch (e) {
      setError(errorMessage(e))
      setRedirecting(false)
    }
  }
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary font-bold text-primary-fg" aria-hidden>MP</span>
            <h1 className="text-xl font-semibold text-fg">MailPilot AI</h1>
          </div>
          <ThemeToggle />
        </div>
        <div className="space-y-4 rounded-xl border border-border bg-surface p-6 shadow-card">
          <div>
            <h2 className="text-lg font-semibold text-fg">Sign in</h2>
            <p className="text-sm text-fg-muted">Use your Google account to continue.</p>
          </div>
          <Button variant="secondary" className="w-full" loading={redirecting} onClick={google} leftIcon={<GoogleIcon />}>Continue with Google</Button>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          {showEmail ? (
            <SignInForm onSubmit={async (v) => { await signIn(v.email, v.password); navigate(from, { replace: true }) }} onMagicLink={sendMagicLink} onForgotPassword={sendPasswordReset} />
          ) : (
            <button type="button" className="w-full text-center text-xs text-fg-muted underline-offset-2 hover:underline" onClick={() => setShowEmail(true)}>Sign in with email and password instead</button>
          )}
        </div>
        <p className="mt-4 flex items-start gap-2 text-xs text-fg-muted">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
          MailPilot never sends, archives or labels email without your explicit approval. AI analysis runs on your own DGX Spark server.
        </p>
      </div>
    </main>
  )
}
