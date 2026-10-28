import { zodResolver } from '@hookform/resolvers/zod'
import { AlertTriangle, GitCompare, Save, Send, Sparkles, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { cn } from '@/lib/cn'
import { diffWords } from '@/lib/diff'
import { relativeTime } from '@/lib/format'
import type { Draft, DraftVersion, Tone } from '@/lib/types'

const EMAIL = /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,63}$/

const addressList = (required: boolean) =>
  z.string().superRefine((value, ctx) => {
    const parts = value.split(/[,;\s]+/).filter(Boolean)
    if (required && parts.length === 0) ctx.addIssue({ code: 'custom', message: 'At least one recipient is required' })
    const bad = parts.filter((p) => !EMAIL.test(p))
    if (bad.length) ctx.addIssue({ code: 'custom', message: `Invalid address: ${bad.join(', ')}` })
  })

export const draftSchema = z.object({
  to: addressList(true),
  cc: addressList(false),
  subject: z.string().trim().min(1, 'Subject is required').max(998).refine((s) => !/[\r\n]/.test(s), 'Subject cannot contain line breaks'),
  body: z.string().trim().min(1, 'The message body is empty').max(50000),
})
export type DraftFormValues = z.infer<typeof draftSchema>

export const TONE_OPTIONS: { value: Tone; label: string }[] = [
  { value: 'professional', label: 'Professional' },
  { value: 'friendly', label: 'Friendly' },
  { value: 'formal', label: 'Formal' },
  { value: 'concise', label: 'Concise' },
  { value: 'custom', label: 'Custom…' },
]

export function splitAddresses(value: string): string[] {
  return value.split(/[,;\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean)
}

export interface DraftEditorProps {
  draft: Draft
  versions?: DraftVersion[]
  onSave: (values: { to: string[]; cc: string[]; subject: string; body: string }) => void
  onRegenerate?: (tone: Tone, customTone: string | null, instructions: string | null) => void
  onRequestApproval?: () => void
  onDiscard?: () => void
  saving?: boolean
  regenerating?: boolean
  requesting?: boolean
  aiAvailable?: boolean
}

export function DraftEditor({
  draft, versions = [], onSave, onRegenerate, onRequestApproval, onDiscard, saving, regenerating, requesting, aiAvailable = true,
}: DraftEditorProps) {
  const locked = draft.status === 'sent' || draft.status === 'discarded'
  const awaiting = draft.status === 'pending_approval' || draft.status === 'approved'
  const { register, handleSubmit, reset, formState: { errors, isDirty } } = useForm<DraftFormValues>({
    resolver: zodResolver(draftSchema),
    defaultValues: { to: draft.to_addresses.join(', '), cc: draft.cc_addresses.join(', '), subject: draft.subject, body: draft.body },
  })
  useEffect(() => {
    reset({ to: draft.to_addresses.join(', '), cc: draft.cc_addresses.join(', '), subject: draft.subject, body: draft.body })
  }, [draft.id, draft.version, draft.to_addresses, draft.cc_addresses, draft.subject, draft.body, reset])

  const [tone, setTone] = useState<Tone>((TONE_OPTIONS.some((t) => t.value === draft.tone) ? draft.tone : 'professional') as Tone)
  const [customTone, setCustomTone] = useState(draft.custom_tone ?? '')
  const [instructions, setInstructions] = useState('')
  const [compareWith, setCompareWith] = useState<string>('')
  const compareVersion = versions.find((v) => String(v.version_no) === compareWith)
  const diff = useMemo(() => (compareVersion ? diffWords(compareVersion.body, draft.body) : []), [compareVersion, draft.body])

  const submit = handleSubmit((v) => onSave({ to: splitAddresses(v.to), cc: splitAddresses(v.cc), subject: v.subject.trim(), body: v.body }))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={draft.status === 'sent' ? 'success' : awaiting ? 'warning' : 'neutral'}>{draft.status.replace('_', ' ')}</Badge>
        <Badge tone="outline">{draft.source === 'ai' ? `AI draft${draft.model ? ` · ${draft.model}` : ''}` : 'Written by you'}</Badge>
        <span className="text-xs text-fg-subtle">Version {draft.current_version_no} · edited {relativeTime(draft.updated_at)}</span>
      </div>

      {awaiting && (
        <p role="status" className="flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          This draft has an approval request. Saving any change cancels that approval; you will need to request approval again.
        </p>
      )}
      {draft.placeholders.length > 0 && (
        <p className="rounded-md bg-info-soft px-3 py-2 text-sm text-info">Fill in before sending: {draft.placeholders.join(', ')}</p>
      )}
      {draft.notes_for_user && <p className="text-sm text-fg-muted">Note from the assistant: {draft.notes_for_user}</p>}

      <form onSubmit={submit} className="space-y-3" aria-label="Edit draft" noValidate>
        <fieldset disabled={locked} className="space-y-3">
          <Input label="To" required error={errors.to?.message} hint="Separate multiple addresses with commas" {...register('to')} />
          <Input label="Cc" error={errors.cc?.message} {...register('cc')} />
          <Input label="Subject" required error={errors.subject?.message} {...register('subject')} />
          <Textarea label="Message" required rows={12} error={errors.body?.message} {...register('body')} />
        </fieldset>
        {!locked && (
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="secondary" loading={saving} disabled={!isDirty} leftIcon={<Save className="h-4 w-4" aria-hidden />}>Save changes</Button>
            {onRequestApproval && (
              <Button type="button" onClick={onRequestApproval} loading={requesting} disabled={isDirty || awaiting} leftIcon={<Send className="h-4 w-4" aria-hidden />}
                title={isDirty ? 'Save your changes first' : undefined}>
                Request send approval
              </Button>
            )}
            {onDiscard && <Button type="button" variant="ghost" onClick={onDiscard} leftIcon={<Trash2 className="h-4 w-4" aria-hidden />}>Discard</Button>}
          </div>
        )}
        {isDirty && !locked && <p className="text-xs text-fg-subtle">Unsaved changes. Nothing is ever sent without your explicit approval.</p>}
      </form>

      {onRegenerate && !locked && (
        <section aria-label="Regenerate with AI" className="space-y-3 rounded-lg border border-border bg-surface-muted p-3">
          <h3 className="text-sm font-semibold text-fg">Regenerate with AI</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="Tone" value={tone} options={TONE_OPTIONS} onChange={(e) => setTone(e.target.value as Tone)} />
            {tone === 'custom' && <Input label="Describe the tone" value={customTone} onChange={(e) => setCustomTone(e.target.value)} maxLength={300} />}
          </div>
          <Textarea label="Instructions (optional)" rows={2} value={instructions} maxLength={1000}
            hint="e.g. “Accept the meeting but propose 4 PM instead.” Your instructions are trusted; email content is not."
            onChange={(e) => setInstructions(e.target.value)} />
          <Button variant="subtle" loading={regenerating} disabled={!aiAvailable || (tone === 'custom' && !customTone.trim())}
            onClick={() => onRegenerate(tone, tone === 'custom' ? customTone : null, instructions || null)}
            leftIcon={<Sparkles className="h-4 w-4" aria-hidden />}>
            Regenerate draft
          </Button>
          {!aiAvailable && <p className="text-xs text-warning">AI drafting is unavailable while the DGX inference server is offline.</p>}
        </section>
      )}

      {versions.length > 1 && (
        <section aria-label="Compare versions" className="space-y-2">
          <div className="flex flex-wrap items-end gap-2">
            <Select label="Compare current draft with" placeholder="Choose a version" value={compareWith}
              onChange={(e) => setCompareWith(e.target.value)}
              options={versions.filter((v) => v.version_no !== draft.current_version_no).map((v) => ({
                value: String(v.version_no), label: `Version ${v.version_no} · ${v.source === 'ai' ? 'AI' : 'you'} · ${v.tone}`,
              }))} />
            <GitCompare className="mb-2.5 h-4 w-4 text-fg-subtle" aria-hidden />
          </div>
          {compareVersion && (
            <div className="rounded-lg border border-border bg-surface p-3 text-sm leading-relaxed whitespace-pre-wrap" aria-label="Differences">
              {diff.map((part, i) => (
                <span key={i} className={cn(part.type === 'added' && 'bg-success-soft text-success underline', part.type === 'removed' && 'bg-danger-soft text-danger line-through')}>
                  {part.type !== 'same' && <span className="sr-only">{part.type === 'added' ? '[added] ' : '[removed] '}</span>}
                  {part.text}
                </span>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
