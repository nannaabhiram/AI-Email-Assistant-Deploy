import { zodResolver } from '@hookform/resolvers/zod'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router'
import { z } from 'zod'
import { PageHeader } from '@/components/layout/PageHeader'
import { DeadlineIndicator } from '@/components/mail/DeadlineIndicator'
import { TaskList } from '@/components/work/TaskList'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog'
import { Dialog } from '@/components/ui/Dialog'
import { Input, Textarea } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/ui/States'
import { Tabs } from '@/components/ui/Tabs'
import { useAction, useCommitments, useTasks } from '@/hooks/queries'
import { api } from '@/lib/api'
import { fromLocalInput } from '@/lib/format'
import type { Commitment, Task } from '@/lib/types'

export const taskSchema = z.object({
  title: z.string().trim().min(1, 'Give the task a title').max(500),
  description: z.string().max(5000).optional(),
  due: z.string().optional().refine((v) => !v || !Number.isNaN(new Date(v).getTime()), 'Invalid date'),
})
type TaskForm = z.infer<typeof taskSchema>

export const commitmentSchema = z.object({
  direction: z.enum(['by_me', 'to_me']),
  description: z.string().trim().min(1, 'Describe the commitment').max(1000),
  counterparty: z.string().max(320).optional(),
  due: z.string().optional(),
})
type CommitmentForm = z.infer<typeof commitmentSchema>

function CommitmentList({ items, onStatus, busy }: { items: Commitment[]; onStatus: (c: Commitment, s: Commitment['status']) => void; busy: boolean }) {
  if (items.length === 0) return <EmptyState title="No commitments" description="Promises you make and follow-ups owed to you are extracted from your email." />
  return (
    <ul className="space-y-2">
      {items.map((c) => (
        <li key={c.id} className="rounded-lg border border-border bg-surface p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={c.direction === 'by_me' ? 'primary' : 'info'}>{c.direction === 'by_me' ? 'You promised' : 'Owed to you'}</Badge>
            {c.status === 'suggested' && <Badge tone="warning">Unconfirmed</Badge>}
            {c.counterparty && <span className="text-xs text-fg-muted">{c.counterparty}</span>}
            <DeadlineIndicator dueAt={c.due_at} dateType={c.due_date_type} done={c.status === 'fulfilled'} />
          </div>
          <p className="mt-1 text-sm text-fg">{c.description}</p>
          {c.evidence && <p className="mt-1 text-xs text-fg-muted italic">“{c.evidence}”</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            {c.status === 'suggested' && <Button size="sm" variant="subtle" disabled={busy} onClick={() => onStatus(c, 'open')}>Confirm</Button>}
            {c.status !== 'fulfilled' && <Button size="sm" variant="secondary" disabled={busy} onClick={() => onStatus(c, 'fulfilled')}>Mark fulfilled</Button>}
            {c.status !== 'cancelled' && <Button size="sm" variant="ghost" disabled={busy} onClick={() => onStatus(c, 'cancelled')}>Cancel</Button>}
            {c.source_message_id && <Link className="self-center text-xs text-primary hover:underline" to={`/inbox/${c.source_message_id}`}>Source email</Link>}
          </div>
        </li>
      ))}
    </ul>
  )
}

export default function TasksPage() {
  const navigate = useNavigate()
  const open = useTasks({ status: ['open'], limit: 200 })
  const suggested = useTasks({ status: ['suggested'], limit: 200 })
  const done = useTasks({ status: ['done', 'dismissed'], limit: 100 })
  const commitments = useCommitments({ status: ['suggested', 'open'] })
  const [creating, setCreating] = useState<'task' | 'commitment' | null>(null)
  const [deleting, setDeleting] = useState<Task | null>(null)
  const inv = [['tasks'], ['commitments']]

  const update = useAction((v: { task: Task; patch: Partial<Task> }) => api.updateTask(v.task.id, { version: v.task.version, ...v.patch }), { invalidate: inv })
  const remove = useAction((t: Task) => api.deleteTask(t.id), { success: 'Task deleted', invalidate: inv, onSuccess: () => setDeleting(null) })
  const updateCommitment = useAction((v: { c: Commitment; status: Commitment['status'] }) => api.updateCommitment(v.c.id, { version: v.c.version, status: v.status }), { invalidate: inv })

  const taskForm = useForm<TaskForm>({ resolver: zodResolver(taskSchema) })
  const createTask = useAction((v: TaskForm) => api.createTask({ title: v.title, description: v.description || null, due_at: fromLocalInput(v.due ?? '') }), {
    success: 'Task added', invalidate: inv, onSuccess: () => { setCreating(null); taskForm.reset() },
  })
  const cForm = useForm<CommitmentForm>({ resolver: zodResolver(commitmentSchema), defaultValues: { direction: 'by_me' } })
  const createCommitment = useAction((v: CommitmentForm) => api.createCommitment({ direction: v.direction, description: v.description, counterparty: v.counterparty || null, due_at: fromLocalInput(v.due ?? '') }), {
    success: 'Commitment added', invalidate: inv, onSuccess: () => { setCreating(null); cForm.reset({ direction: 'by_me' }) },
  })

  const handlers = {
    onToggleDone: (t: Task) => update.mutate({ task: t, patch: { status: t.status === 'done' ? 'open' : 'done' } }),
    onConfirm: (t: Task) => update.mutate({ task: t, patch: { status: 'open' } }),
    onDismiss: (t: Task) => update.mutate({ task: t, patch: { status: 'dismissed' } }),
    onDelete: (t: Task) => setDeleting(t),
    onOpenSource: (id: string) => navigate(`/inbox/${id}`),
    busyId: update.isPending ? update.variables?.task.id : null,
  }

  return (
    <div>
      <PageHeader
        title="Tasks & commitments"
        description="Extracted from your email with the exact quote as evidence. Uncertain items wait for your confirmation; deadlines are never invented."
        actions={<>
          <Button variant="secondary" leftIcon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => setCreating('commitment')}>Add commitment</Button>
          <Button leftIcon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => setCreating('task')}>Add task</Button>
        </>}
      />
      <Tabs
        label="Task views"
        tabs={[
          { id: 'open', label: 'Open', count: open.data?.total, content: <TaskList tasks={open.data?.items} loading={open.isLoading} error={open.error} onRetry={() => void open.refetch()} emptyTitle="No open tasks" {...handlers} /> },
          { id: 'suggested', label: 'Needs confirmation', count: suggested.data?.total, content: <TaskList tasks={suggested.data?.items} loading={suggested.isLoading} error={suggested.error} emptyTitle="Nothing to confirm" emptyDescription="Ambiguous or inferred tasks appear here for review." {...handlers} /> },
          {
            id: 'commitments', label: 'Commitments', count: commitments.data?.total, content: commitments.isLoading ? <LoadingSkeleton lines={3} variant="card" />
              : commitments.error ? <ErrorState error={commitments.error} onRetry={() => void commitments.refetch()} />
              : <CommitmentList items={commitments.data?.items ?? []} busy={updateCommitment.isPending} onStatus={(c, status) => updateCommitment.mutate({ c, status })} />,
          },
          { id: 'done', label: 'Done & dismissed', content: <TaskList tasks={done.data?.items} loading={done.isLoading} error={done.error} emptyTitle="Nothing completed yet" {...handlers} /> },
        ]}
      />
      <Dialog open={creating === 'task'} onClose={() => setCreating(null)} title="Add a task"
        footer={<><Button variant="secondary" onClick={() => setCreating(null)}>Cancel</Button><Button type="submit" form="task-form" loading={createTask.isPending}>Add task</Button></>}>
        <form id="task-form" noValidate className="space-y-3" onSubmit={taskForm.handleSubmit((v) => createTask.mutate(v))}>
          <Input label="Title" required error={taskForm.formState.errors.title?.message} {...taskForm.register('title')} />
          <Textarea label="Notes" rows={3} {...taskForm.register('description')} />
          <Input label="Due" type="datetime-local" error={taskForm.formState.errors.due?.message} {...taskForm.register('due')} />
        </form>
      </Dialog>
      <Dialog open={creating === 'commitment'} onClose={() => setCreating(null)} title="Add a commitment"
        footer={<><Button variant="secondary" onClick={() => setCreating(null)}>Cancel</Button><Button type="submit" form="commitment-form" loading={createCommitment.isPending}>Add</Button></>}>
        <form id="commitment-form" noValidate className="space-y-3" onSubmit={cForm.handleSubmit((v) => createCommitment.mutate(v))}>
          <Select label="Type" options={[{ value: 'by_me', label: 'I promised something' }, { value: 'to_me', label: 'Someone owes me something' }]} {...cForm.register('direction')} />
          <Input label="What" required error={cForm.formState.errors.description?.message} {...cForm.register('description')} />
          <Input label="Who (email or name)" {...cForm.register('counterparty')} />
          <Input label="Due" type="datetime-local" {...cForm.register('due')} />
        </form>
      </Dialog>
      <ConfirmationDialog open={deleting !== null} title="Delete this task?" description={deleting?.title} destructive confirmLabel="Delete"
        loading={remove.isPending} onCancel={() => setDeleting(null)} onConfirm={() => deleting && remove.mutate(deleting)} />
    </div>
  )
}
