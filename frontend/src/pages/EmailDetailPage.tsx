import { CalendarDays, ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { AttachmentCard } from '@/components/mail/AttachmentCard'
import { EmailDetailHeader } from '@/components/mail/EmailDetailHeader'
import { AnalysisPanel, EmailPreview, RiskPanel } from '@/components/mail/EmailPreview'
import { EmailSummary } from '@/components/mail/EmailSummary'
import { EmailThread } from '@/components/mail/EmailThread'
import { TaskCard } from '@/components/work/TaskCard'
import { TONE_OPTIONS } from '@/components/work/DraftEditor'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { Dialog } from '@/components/ui/Dialog'
import { Input, Textarea } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Card, ErrorState, LoadingSkeleton } from '@/components/ui/States'
import { Tabs } from '@/components/ui/Tabs'
import { keys, useAction, useEmail, useJobWatcher, useSystemStatus, useThread } from '@/hooks/queries'
import { api } from '@/lib/api'
import { formatDateTime } from '@/lib/format'
import type { Priority, Task, Tone } from '@/lib/types'

export default function EmailDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const email = useEmail(id)
  const thread = useThread(email.data?.thread_id)
  const status = useSystemStatus()
  const aiOnline = Boolean(status.data?.llm.reachable)
  const [replyOpen, setReplyOpen] = useState(false)
  const [tone, setTone] = useState<Tone>('professional')
  const [customTone, setCustomTone] = useState('')
  const [instructions, setInstructions] = useState('')
  const [useAi, setUseAi] = useState(true)
  const [overrideComment, setOverrideComment] = useState('')

  const emailKey = keys.email(id ?? '')
  const analysisJob = useJobWatcher([emailKey, ['emails']])
  const summaryJob = useJobWatcher([keys.thread(email.data?.thread_id ?? '')])
  const attachmentJob = useJobWatcher([emailKey, ['attachments']])

  const reanalyze = useAction(() => api.reanalyze(id!), { success: 'Re-analysis queued', onSuccess: (r) => analysisJob.watch(r.job_id) })
  const summarize = useAction(() => api.summarizeThread(email.data!.thread_id), { onSuccess: (r) => summaryJob.watch(r.job_id) })
  const extract = useAction((attId: string) => api.extractAttachment(attId), { success: 'Attachment analysis started', onSuccess: (r) => attachmentJob.watch(r.job_id) })
  const download = useAction((attId: string) => api.attachmentUrl(attId), { onSuccess: (r) => window.open(r.url, '_blank', 'noopener,noreferrer') })
  const override = useAction((p: Priority | null) => api.overridePriority(id!, p, overrideComment || undefined), {
    success: 'Priority updated — your feedback was recorded', invalidate: [emailKey, ['emails']], onSuccess: () => setOverrideComment(''),
  })
  const createDraft = useAction(
    () => api.createDraft({ message_id: id!, tone, custom_tone: tone === 'custom' ? customTone : null, instructions: instructions || null, use_ai: useAi && aiOnline }),
    { success: 'Draft created', invalidate: [keys.drafts], onSuccess: (d) => navigate(`/drafts/${d.id}`), errorTitle: 'Could not create the draft' },
  )
  const taskUpdate = useAction((t: { task: Task; status: Task['status'] }) => api.updateTask(t.task.id, { version: t.task.version, status: t.status }), {
    invalidate: [emailKey, ['tasks']],
  })

  if (email.isLoading) return <LoadingSkeleton lines={10} label="Loading email" />
  if (email.error || !email.data) return <ErrorState error={email.error} onRetry={() => void email.refetch()} />
  const e = email.data
  const a = e.analysis

  return (
    <div className="space-y-6">
      <EmailDetailHeader email={e} onBack={() => navigate(-1)} onReply={() => setReplyOpen(true)} onReanalyze={() => reanalyze.mutate(undefined)}
        reanalyzing={reanalyze.isPending || analysisJob.running} />
      {['pending', 'queued'].includes(e.analysis_status) && (
        <p role="status" className="rounded-md bg-info-soft px-3 py-2 text-sm text-info">
          {a ? 'Showing a rule-based result. AI analysis is queued and will update this page automatically.' : 'Analysis is queued. This page updates automatically.'}
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <Tabs
            label="Email views"
            tabs={[
              { id: 'message', label: 'Message', content: <EmailPreview email={e} /> },
              {
                id: 'thread', label: 'Conversation', count: thread.data?.message_count, content: thread.isLoading ? <LoadingSkeleton lines={4} /> : thread.data ? (
                  <div className="space-y-4">
                    <EmailSummary summary={thread.data.summary} stale={thread.data.summary_stale} onSummarize={() => summarize.mutate(undefined)}
                      loading={summarize.isPending || summaryJob.running} />
                    <EmailThread messages={thread.data.messages} currentId={e.id} onSelect={(mid) => navigate(`/inbox/${mid}`)} />
                  </div>
                ) : <ErrorState error={thread.error} onRetry={() => void thread.refetch()} />,
              },
              {
                id: 'attachments', label: 'Attachments', count: e.attachments.length, content: e.attachments.length ? (
                  <div className="space-y-3">{e.attachments.map((att) => (
                    <AttachmentCard key={att.id} attachment={att} expanded onExtract={(aid) => extract.mutate(aid)} onDownload={(aid) => download.mutate(aid)}
                      extracting={extract.isPending && extract.variables === att.id} />
                  ))}</div>
                ) : <p className="text-sm text-fg-muted">No attachments.</p>,
              },
            ]}
          />
        </div>
        <aside className="space-y-4 lg:col-span-2" aria-label="Analysis">
          {a ? <AnalysisPanel analysis={a} /> : <Card title="Analysis"><p className="text-sm text-fg-muted">Not analysed yet.</p></Card>}
          {a && <RiskPanel analysis={a} />}
          {a && (
            <Card title="Correct the priority" description="Overrides are saved as feedback for evaluating the classifier.">
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2" role="group" aria-label="Set priority">
                  {(['HIGH', 'MEDIUM', 'LOW'] as const).map((p) => (
                    <Button key={p} size="sm" variant={a.effective_priority === p ? 'primary' : 'secondary'} aria-pressed={a.effective_priority === p}
                      disabled={override.isPending} onClick={() => override.mutate(p)}>{p[0]}{p.slice(1).toLowerCase()}</Button>
                  ))}
                  {a.user_override_priority && <Button size="sm" variant="ghost" onClick={() => override.mutate(null)}>Reset to AI</Button>}
                </div>
                <Input label="Why? (optional)" value={overrideComment} onChange={(ev) => setOverrideComment(ev.target.value)} maxLength={500} />
              </div>
            </Card>
          )}
          {(e.tasks.length > 0 || e.commitments.length > 0) && (
            <Card title="Tasks & commitments from this email">
              <div className="space-y-2">
                {e.tasks.map((t) => (
                  <TaskCard key={t.id} task={t} busy={taskUpdate.isPending}
                    onToggleDone={(task) => taskUpdate.mutate({ task, status: task.status === 'done' ? 'open' : 'done' })}
                    onConfirm={(task) => taskUpdate.mutate({ task, status: 'open' })}
                    onDismiss={(task) => taskUpdate.mutate({ task, status: 'dismissed' })} />
                ))}
                {e.commitments.map((c) => (
                  <p key={c.id} className="rounded-md border border-border p-2 text-sm text-fg">
                    <span className="font-medium">{c.direction === 'by_me' ? 'You promised: ' : 'Owed to you: '}</span>{c.description}
                    {c.needs_confirmation && <span className="ml-1 text-xs text-warning">(unconfirmed)</span>}
                  </p>
                ))}
              </div>
            </Card>
          )}
          {e.meetings.length > 0 && (
            <Card title="Meeting detected">
              {e.meetings.map((m) => (
                <div key={m.id} className="space-y-1 text-sm">
                  <p className="flex items-center gap-1.5 font-medium text-fg"><CalendarDays className="h-4 w-4" aria-hidden />{m.title ?? 'Meeting'}</p>
                  {m.start_at && <p className="text-fg-muted">{formatDateTime(m.start_at)}{m.timezone ? ` (${m.timezone})` : ''}</p>}
                  {m.location && <p className="text-fg-muted">{m.location}</p>}
                  {m.conference_url && <p className="flex items-center gap-1 break-all font-mono text-xs text-fg-muted"><ExternalLink className="h-3 w-3" aria-hidden />{m.conference_url}</p>}
                  {m.agenda && <p className="text-fg-muted">Agenda: {m.agenda}</p>}
                  {m.requested_response && <p className="text-warning">{m.requested_response}</p>}
                  <p className="text-xs text-fg-subtle">Calendar changes are not made automatically. Reply or use your calendar to respond.</p>
                </div>
              ))}
            </Card>
          )}
        </aside>
      </div>
      <Dialog open={replyOpen} onClose={() => setReplyOpen(false)} title="Draft a reply" description="The draft is saved for you to edit. Nothing is sent until you approve it."
        footer={<><Button variant="secondary" onClick={() => setReplyOpen(false)}>Cancel</Button>
          <Button loading={createDraft.isPending} disabled={useAi && aiOnline && tone === 'custom' && !customTone.trim()} onClick={() => createDraft.mutate(undefined)}>
            {useAi && aiOnline ? 'Generate draft' : 'Start blank draft'}</Button></>}>
        <div className="space-y-3">
          <Checkbox label="Write the first version with AI" description={aiOnline ? 'Uses the full thread as context.' : 'DGX inference is currently unavailable.'}
            checked={useAi && aiOnline} disabled={!aiOnline} onChange={(ev) => setUseAi(ev.target.checked)} />
          {useAi && aiOnline && (
            <>
              <Select label="Tone" options={TONE_OPTIONS} value={tone} onChange={(ev) => setTone(ev.target.value as Tone)} />
              {tone === 'custom' && <Input label="Describe the tone" value={customTone} onChange={(ev) => setCustomTone(ev.target.value)} maxLength={300} />}
              <Textarea label="Instructions (optional)" rows={3} value={instructions} onChange={(ev) => setInstructions(ev.target.value)} maxLength={1000}
                hint="Tell the assistant what to say, e.g. “Confirm Thursday works.”" />
            </>
          )}
        </div>
      </Dialog>
    </div>
  )
}
