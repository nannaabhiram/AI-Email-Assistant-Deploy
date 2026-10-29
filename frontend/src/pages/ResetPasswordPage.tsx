import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router'
import { z } from 'zod'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { LoadingSkeleton } from '@/components/ui/States'
import { useAuth } from '@/hooks/useAuth'
import { errorMessage } from '@/lib/api'

export const resetSchema = z
  .object({
    password: z.string().min(10, 'Use at least 10 characters').regex(/[A-Za-z]/, 'Include a letter').regex(/\d/, 'Include a number'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })

type ResetValues = z.infer<typeof resetSchema>

export function ResetPasswordForm({ onSubmit }: { onSubmit: (password: string) => Promise<void> }) {
  const [error, setError] = useState<string | null>(null)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<ResetValues>({ resolver: zodResolver(resetSchema) })
  const submit = handleSubmit(async (v) => {
    setError(null)
    try {
      await onSubmit(v.password)
    } catch (e) {
      setError(errorMessage(e))
    }
  })
  return (
    <form onSubmit={submit} noValidate className="space-y-4" aria-label="Choose a new password">
      <Input label="New password" type="password" autoComplete="new-password" required hint="At least 10 characters with a letter and a number." error={errors.password?.message} {...register('password')} />
      <Input label="Confirm new password" type="password" autoComplete="new-password" required error={errors.confirm?.message} {...register('confirm')} />
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <Button type="submit" className="w-full" loading={isSubmitting}>Update password</Button>
    </form>
  )
}

export default function ResetPasswordPage() {
  const { session, loading, updatePassword } = useAuth()
  const navigate = useNavigate()
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4 py-10">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-card">
        <h1 className="mb-1 text-xl font-semibold text-fg">Choose a new password</h1>
        {loading ? (
          <LoadingSkeleton lines={3} label="Checking your reset link" />
        ) : session ? (
          <>
            <p className="mb-4 text-sm text-fg-muted">For {session.user.email}</p>
            <ResetPasswordForm onSubmit={async (p) => { await updatePassword(p); navigate('/dashboard', { replace: true }) }} />
          </>
        ) : (
          <p className="text-sm text-fg-muted">
            This reset link is invalid or has expired. <Link className="text-primary underline" to="/login">Request a new one</Link> from the sign-in page.
          </p>
        )}
      </div>
    </main>
  )
}
