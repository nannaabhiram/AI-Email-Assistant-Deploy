import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Card, ErrorState, LoadingSkeleton } from '@/components/ui/States'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { keys, useAction, useSettings } from '@/hooks/queries'
import { api } from '@/lib/api'
import { canonicalTimezone, timezoneOptions } from '@/lib/timezones'
import type { Settings } from '@/lib/types'

const num = (min: number, max: number) => z.coerce.number().min(min, `Minimum ${min}`).max(max, `Maximum ${max}`)

export const preferencesSchema = z
  .object({
    timezone: z.string().min(1),
    briefing_enabled: z.boolean(),
    briefing_time: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM'),
    notify_in_app: z.boolean(),
    notify_reminders: z.boolean(),
    notify_briefing: z.boolean(),
    threshold_high: num(1, 100),
    threshold_medium: num(0, 99),
    w_deadline: num(0, 1), w_action: num(0, 1), w_impact: num(0, 1), w_sender: num(0, 1), w_context: num(0, 1),
    review_confidence_threshold: num(0, 1),
    auto_analyze: z.boolean(),
    attachment_auto_extract: z.boolean(),
    attachment_max_mb: num(1, 50),
    store_attachments: z.boolean(),
    email_retention_days: num(7, 3650),
    sync_lookback_days: num(1, 365),
    sync_max_messages: num(50, 20000),
    default_reply_tone: z.enum(['professional', 'friendly', 'formal', 'concise']),
    newsletter_digest: z.boolean(),
  })
  .refine((v) => v.threshold_medium < v.threshold_high, { path: ['threshold_medium'], message: 'Must be below the HIGH threshold' })
  .refine((v) => v.w_deadline + v.w_action + v.w_impact + v.w_sender + v.w_context > 0, { path: ['w_deadline'], message: 'At least one weight must be above 0' })

type FormValues = z.output<typeof preferencesSchema>
type FormInput = z.input<typeof preferencesSchema>

function toForm(s: Settings): FormValues {
  return {
    timezone: canonicalTimezone(s.timezone), briefing_enabled: s.briefing_enabled, briefing_time: s.briefing_time.slice(0, 5),
    notify_in_app: s.notification_prefs.in_app ?? true, notify_reminders: s.notification_prefs.reminders ?? true, notify_briefing: s.notification_prefs.briefing ?? true,
    threshold_high: s.priority_thresholds.high, threshold_medium: s.priority_thresholds.medium,
    w_deadline: s.scoring_weights.deadline, w_action: s.scoring_weights.action, w_impact: s.scoring_weights.impact, w_sender: s.scoring_weights.sender, w_context: s.scoring_weights.context,
    review_confidence_threshold: Number(s.review_confidence_threshold), auto_analyze: s.auto_analyze, attachment_auto_extract: s.attachment_auto_extract,
    attachment_max_mb: Math.round(s.attachment_max_bytes / 1048576), store_attachments: s.store_attachments, email_retention_days: s.email_retention_days,
    sync_lookback_days: s.sync_lookback_days, sync_max_messages: s.sync_max_messages,
    default_reply_tone: (['professional', 'friendly', 'formal', 'concise'].includes(s.default_reply_tone) ? s.default_reply_tone : 'professional') as FormValues['default_reply_tone'],
    newsletter_digest: s.newsletter_digest,
  }
}

export default function PreferencesPage() {
  const settings = useSettings()
  const [wipe, setWipe] = useState(false)
  const form = useForm<FormInput, unknown, FormValues>({ resolver: zodResolver(preferencesSchema) })
  const { register, handleSubmit, reset, formState: { errors, isDirty } } = form
  const timezones = useMemo(() => timezoneOptions(settings.data && canonicalTimezone(settings.data.timezone)), [settings.data])
  useEffect(() => { if (settings.data) reset(toForm(settings.data)) }, [settings.data, reset])

  const save = useAction((v: FormValues) => api.updateSettings({
    version: settings.data!.version, timezone: v.timezone, briefing_enabled: v.briefing_enabled, briefing_time: `${v.briefing_time}:00`,
    notification_prefs: { in_app: v.notify_in_app, reminders: v.notify_reminders, briefing: v.notify_briefing },
    priority_thresholds: { high: v.threshold_high, medium: v.threshold_medium },
    scoring_weights: { deadline: v.w_deadline, action: v.w_action, impact: v.w_impact, sender: v.w_sender, context: v.w_context },
    review_confidence_threshold: v.review_confidence_threshold, auto_analyze: v.auto_analyze, attachment_auto_extract: v.attachment_auto_extract,
    attachment_max_bytes: Math.round(v.attachment_max_mb * 1048576), store_attachments: v.store_attachments, email_retention_days: v.email_retention_days,
    sync_lookback_days: v.sync_lookback_days, sync_max_messages: v.sync_max_messages, default_reply_tone: v.default_reply_tone, newsletter_digest: v.newsletter_digest,
  }), { success: 'Preferences saved', invalidate: [keys.settings, keys.me], errorTitle: 'Could not save preferences' })
  const wipeData = useAction(() => api.deleteEmailData(), { success: 'Synced email data deleted', invalidate: [['emails'], keys.status], onSuccess: () => setWipe(false) })

  if (settings.isLoading) return <LoadingSkeleton lines={10} />
  if (settings.error || !settings.data) return <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />

  return (
    <form noValidate onSubmit={handleSubmit((v) => save.mutate(v))} className="space-y-6" aria-label="Preferences">
      <PageHeader title="Preferences" description="Scoring, briefings, notifications, attachments and data retention."
        actions={<Button type="submit" loading={save.isPending} disabled={!isDirty}>Save preferences</Button>} />
      <Card title="Appearance"><ThemeToggle /></Card>
      <Card title="Daily briefing & notifications">
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Timezone" options={timezones} {...register('timezone')} />
          <Input label="Briefing time" type="time" error={errors.briefing_time?.message} {...register('briefing_time')} />
          <Checkbox label="Generate a daily briefing" {...register('briefing_enabled')} />
          <Checkbox label="In-app notifications" {...register('notify_in_app')} />
          <Checkbox label="Task reminders" {...register('notify_reminders')} />
          <Checkbox label="Briefing notifications" {...register('notify_briefing')} />
        </div>
      </Card>
      <Card title="Priority scoring" description="Score = weighted sum of components (0–100). Security alerts, critical incidents, high phishing risk and imminent deadlines are always HIGH.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Input label="HIGH threshold" type="number" error={errors.threshold_high?.message} {...register('threshold_high')} />
          <Input label="MEDIUM threshold" type="number" error={errors.threshold_medium?.message} {...register('threshold_medium')} />
          <Input label="Review if confidence below" type="number" step="0.05" error={errors.review_confidence_threshold?.message} {...register('review_confidence_threshold')} />
        </div>
        <fieldset className="mt-4">
          <legend className="mb-2 text-sm font-medium text-fg">Weights (normalised automatically)</legend>
          <div className="grid gap-3 sm:grid-cols-5">
            <Input label="Deadline" type="number" step="0.05" error={errors.w_deadline?.message} {...register('w_deadline')} />
            <Input label="Action" type="number" step="0.05" error={errors.w_action?.message} {...register('w_action')} />
            <Input label="Impact" type="number" step="0.05" error={errors.w_impact?.message} {...register('w_impact')} />
            <Input label="Sender" type="number" step="0.05" error={errors.w_sender?.message} {...register('w_sender')} />
            <Input label="Context" type="number" step="0.05" error={errors.w_context?.message} {...register('w_context')} />
          </div>
        </fieldset>
      </Card>
      <Card title="Analysis & drafting">
        <div className="grid gap-4 sm:grid-cols-2">
          <Checkbox label="Analyse new emails automatically" description="Runs on the DGX Spark server in the background." {...register('auto_analyze')} />
          <Checkbox label="Newsletter digest" {...register('newsletter_digest')} />
          <Select label="Default reply tone" options={[{ value: 'professional', label: 'Professional' }, { value: 'friendly', label: 'Friendly' }, { value: 'formal', label: 'Formal' }, { value: 'concise', label: 'Concise' }]} {...register('default_reply_tone')} />
        </div>
      </Card>
      <Card title="Attachments">
        <div className="grid gap-4 sm:grid-cols-2">
          <Checkbox label="Analyse attachments automatically" description="Otherwise only on request." {...register('attachment_auto_extract')} />
          <Checkbox label="Store analysed attachments" description="Private Supabase Storage; download links expire after two minutes." {...register('store_attachments')} />
          <Input label="Maximum attachment size (MB)" type="number" error={errors.attachment_max_mb?.message} {...register('attachment_max_mb')} />
        </div>
      </Card>
      <Card title="Sync & retention">
        <div className="grid gap-4 sm:grid-cols-3">
          <Input label="Initial sync window (days)" type="number" error={errors.sync_lookback_days?.message} {...register('sync_lookback_days')} />
          <Input label="Initial sync limit (messages)" type="number" error={errors.sync_max_messages?.message} {...register('sync_max_messages')} />
          <Input label="Keep synced mail for (days)" type="number" hint="Older messages are deleted from MailPilot (not from Gmail)." error={errors.email_retention_days?.message} {...register('email_retention_days')} />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <p className="flex-1 text-sm text-fg-muted">Delete all synced email, analyses, tasks extracted from email and attachments. Connected accounts and Gmail itself are unaffected.</p>
          <Button type="button" variant="danger" onClick={() => setWipe(true)}>Delete synced data</Button>
        </div>
      </Card>
      <ConfirmationDialog open={wipe} title="Delete all synced email data?" description="The next sync will download mail again from the configured window." destructive
        requireText="DELETE" confirmLabel="Delete data" loading={wipeData.isPending} onCancel={() => setWipe(false)} onConfirm={() => wipeData.mutate(undefined)} />
    </form>
  )
}
