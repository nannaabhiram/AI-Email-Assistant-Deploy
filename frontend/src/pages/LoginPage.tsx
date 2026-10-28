import { zodResolver } from '@hookform/resolvers/zod'
import { Mail, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { z } from 'zod'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Tabs } from '@/components/ui/Tabs'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { useAuth } from '@/hooks/useAuth'
import { errorMessage } from '@/lib/api'

export const loginSchema = z.object({
  email: z.email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
})
export const signupSchema = z
  .object({
    email: z.email('Enter a valid email address'),
    password: z.string().min(10, 'Use at least 10 characters').regex(/[A-Za-z]/, 'Include a letter').regex(/\d/, 'Include a number'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })

type LoginValues = z.infer<typeof loginSchema>
type SignupValues = z.infer<typeof signupSchema>

export function SignInForm({ onSubmit, onMagicLink }: { onSubmit: (v: LoginValues) => Promise<void>; onMagicLink: (email: string) => Promise<void> }) {
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
    try {
      await onMagicLink(getValues('email'))
      setInfo('Check your inbox for a sign-in link.')
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
    </form>
  )
}

export function SignUpForm({ onSubmit }: { onSubmit: (v: SignupValues) => Promise<string | null> }) {
  const [message, setMessage] = useState<{ tone: 'error' | 'ok'; text: string } | null>(null)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<SignupValues>({ resolver: zodResolver(signupSchema) })
  const submit = handleSubmit(async (v) => {
    try {
      const note = await onSubmit(v)
      if (note) setMessage({ tone: 'ok', text: note })
    } catch (e) {
      setMessage({ tone: 'error', text: errorMessage(e) })
    }
  })
  return (
    <form onSubmit={submit} noValidate className="space-y-4" aria-label="Create account">
      <Input label="Email" type="email" autoComplete="email" required error={errors.email?.message} {...register('email')} />
      <Input label="Password" type="password" autoComplete="new-password" required hint="At least 10 characters with a letter and a number." error={errors.password?.message} {...register('password')} />
      <Input label="Confirm password" type="password" autoComplete="new-password" required error={errors.confirm?.message} {...register('confirm')} />
      {message && <p role={message.tone === 'error' ? 'alert' : 'status'} className={message.tone === 'error' ? 'text-sm text-danger' : 'text-sm text-success'}>{message.text}</p>}
      <Button type="submit" className="w-full" loading={isSubmitting}>Create account</Button>
    </form>
  )
}

export default function LoginPage() {
  const { session, signIn, signUp, sendMagicLink } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard'
  if (session) return <Navigate to={from} replace />
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
        <div className="rounded-xl border border-border bg-surface p-6 shadow-card">
          <Tabs
            label="Authentication"
            tabs={[
              { id: 'signin', label: 'Sign in', content: <SignInForm onSubmit={async (v) => { await signIn(v.email, v.password); navigate(from, { replace: true }) }} onMagicLink={sendMagicLink} /> },
              {
                id: 'signup', label: 'Create account', content: (
                  <SignUpForm onSubmit={async (v) => {
                    const { needsConfirmation } = await signUp(v.email, v.password)
                    if (needsConfirmation) return 'Account created. Confirm your email address, then sign in.'
                    navigate('/onboarding', { replace: true })
                    return null
                  }} />
                ),
              },
            ]}
          />
        </div>
        <p className="mt-4 flex items-start gap-2 text-xs text-fg-muted">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
          MailPilot never sends, archives or labels email without your explicit approval. AI analysis runs on your own DGX Spark server.
        </p>
      </div>
    </main>
  )
}
