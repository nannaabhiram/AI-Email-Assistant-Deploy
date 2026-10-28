import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Sparkles, Star, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router'
import { z } from 'zod'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmailList } from '@/components/mail/EmailList'
import { SenderIdentity } from '@/components/mail/SenderIdentity'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog'
import { Dialog } from '@/components/ui/Dialog'
import { Input, Textarea } from '@/components/ui/Input'
import { Pagination } from '@/components/ui/Pagination'
import { SearchInput } from '@/components/ui/SearchInput'
import { Select } from '@/components/ui/Select'
import { Card, EmptyState, ErrorState, LoadingSkeleton } from '@/components/ui/States'
import { keys, useAction, useContact, useContacts, useSystemStatus } from '@/hooks/queries'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { relativeTime } from '@/lib/format'
import type { ContactPreferences, Priority } from '@/lib/types'

const contactSchema = z.object({
  email: z.email('Enter a valid email address'),
  display_name: z.string().max(200).optional(),
  importance: z.coerce.number().int().min(0).max(100),
  is_vip: z.boolean(),
})
type ContactForm = z.output<typeof contactSchema>
type ContactInput = z.input<typeof contactSchema>

const PRIORITY_OPTIONS = [{ value: '', label: 'No rule' }, { value: 'HIGH', label: 'High' }, { value: 'MEDIUM', label: 'Medium' }, { value: 'LOW', label: 'Low' }]

function ContactDetailPanel({ id }: { id: string }) {
  const navigate = useNavigate()
  const contact = useContact(id)
  const status = useSystemStatus()
  const inv = [keys.contact(id), ['contacts']]
  const [notes, setNotes] = useState('')
  const [importance, setImportance] = useState(50)
  const [prefs, setPrefs] = useState<ContactPreferences>({ priority_floor: null, priority_ceiling: null, muted: false, digest: false, preferred_tone: null })
  const [clearing, setClearing] = useState(false)
  useEffect(() => {
    if (!contact.data) return
    setNotes(contact.data.notes ?? '')
    setImportance(contact.data.importance)
    if (contact.data.preferences) setPrefs(contact.data.preferences)
  }, [contact.data])

  const update = useAction((body: Parameters<typeof api.updateContact>[1]) => api.updateContact(id, body), { success: 'Contact updated', invalidate: inv })
  const savePrefs = useAction(() => api.setContactPreferences(id, prefs), { success: 'Sender rules saved', invalidate: inv })
  const summarize = useAction(() => api.summarizeContact(id), { success: 'Relationship memory refreshed', invalidate: inv })
  const clear = useAction(() => api.clearContactMemory(id), { success: 'Memory deleted', invalidate: inv, onSuccess: () => setClearing(false) })

  if (contact.isLoading) return <LoadingSkeleton lines={6} />
  if (contact.error || !contact.data) return <ErrorState error={contact.error} onRetry={() => void contact.refetch()} />
  const c = contact.data
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <SenderIdentity name={c.display_name} email={c.email} vip={c.is_vip} size="lg" />
        <Button className="ml-auto" variant={c.is_vip ? 'subtle' : 'secondary'} size="sm" aria-pressed={c.is_vip}
          leftIcon={<Star className={cn('h-4 w-4', c.is_vip && 'fill-current')} aria-hidden />} onClick={() => update.mutate({ is_vip: !c.is_vip })}>
          {c.is_vip ? 'VIP' : 'Mark as VIP'}
        </Button>
      </div>
      <p className="text-sm text-fg-muted">{c.inbound_count} received · {c.outbound_count} sent · last contact {relativeTime(c.last_inbound_at ?? c.last_outbound_at)}</p>
      <Card title="Importance & notes">
        <div className="space-y-3">
          <div>
            <label htmlFor="importance" className="text-sm font-medium text-fg">Importance: {importance}</label>
            <input id="importance" type="range" min={0} max={100} value={importance} onChange={(e) => setImportance(Number(e.target.value))} className="w-full accent-primary" />
          </div>
          <Textarea label="Notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={4000} />
          <Button size="sm" loading={update.isPending} onClick={() => update.mutate({ importance, notes })}>Save</Button>
        </div>
      </Card>
      <Card title="Sender rules" description="Applied after scoring. Security alerts and imminent deadlines are never downgraded.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="Minimum priority" options={PRIORITY_OPTIONS} value={prefs.priority_floor ?? ''} onChange={(e) => setPrefs({ ...prefs, priority_floor: (e.target.value || null) as Priority | null })} />
          <Select label="Maximum priority" options={PRIORITY_OPTIONS} value={prefs.priority_ceiling ?? ''} onChange={(e) => setPrefs({ ...prefs, priority_ceiling: (e.target.value || null) as Priority | null })} />
          <Checkbox label="Mute (always low)" checked={prefs.muted} onChange={(e) => setPrefs({ ...prefs, muted: e.target.checked })} />
          <Checkbox label="Include in digest" checked={prefs.digest} onChange={(e) => setPrefs({ ...prefs, digest: e.target.checked })} />
          <Input label="Preferred reply tone" value={prefs.preferred_tone ?? ''} onChange={(e) => setPrefs({ ...prefs, preferred_tone: e.target.value || null })} placeholder="e.g. formal, in Hindi" />
        </div>
        <Button className="mt-3" size="sm" loading={savePrefs.isPending} onClick={() => savePrefs.mutate(undefined)}>Save rules</Button>
      </Card>
      <Card title="Relationship memory" description="Built only from your messages with this contact. Editable and deletable."
        actions={<>
          <Button size="sm" variant="secondary" disabled={!status.data?.llm.reachable} loading={summarize.isPending} onClick={() => summarize.mutate(undefined)} leftIcon={<Sparkles className="h-4 w-4" aria-hidden />}>Refresh</Button>
          {c.relationship_summary && <Button size="sm" variant="ghost" onClick={() => setClearing(true)} leftIcon={<Trash2 className="h-4 w-4" aria-hidden />}>Delete</Button>}
        </>}>
        {c.relationship_summary ? (
          <div><p className="text-sm whitespace-pre-wrap text-fg">{c.relationship_summary}</p><p className="mt-1 text-xs text-fg-subtle">Updated {relativeTime(c.relationship_summary_at)}</p></div>
        ) : <p className="text-sm text-fg-muted">{status.data?.llm.reachable ? 'No memory yet. Refresh to summarise recent conversations.' : 'Requires the DGX inference server.'}</p>}
        {c.open_commitments.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm">{c.open_commitments.map((x) => <li key={x.id}><Badge tone="outline">{x.direction === 'by_me' ? 'You promised' : 'Owed to you'}</Badge> {x.description}</li>)}</ul>
        )}
      </Card>
      <Card title="Recent emails">
        <EmailList emails={c.recent_messages} onOpen={(mid) => navigate(`/inbox/${mid}`)} emptyTitle="No emails from this contact" />
      </Card>
      <ConfirmationDialog open={clearing} title="Delete relationship memory?" description="The summary and notes for this contact will be removed." destructive confirmLabel="Delete"
        loading={clear.isPending} onCancel={() => setClearing(false)} onConfirm={() => clear.mutate(undefined)} />
    </div>
  )
}

export default function ContactsPage() {
  const { id } = useParams()
  const [q, setQ] = useState('')
  const [vipOnly, setVipOnly] = useState(false)
  const [offset, setOffset] = useState(0)
  const [adding, setAdding] = useState(false)
  const contacts = useContacts({ q: q || undefined, vip: vipOnly || undefined, sort: 'importance', limit: 50, offset })
  const form = useForm<ContactInput, unknown, ContactForm>({ resolver: zodResolver(contactSchema), defaultValues: { importance: 50, is_vip: false } })
  const create = useAction((v: ContactForm) => api.createContact({ ...v, display_name: v.display_name || null }), {
    success: 'Contact added', invalidate: [['contacts']], onSuccess: () => { setAdding(false); form.reset() },
  })
  return (
    <div>
      <PageHeader title="Contacts & VIPs" description="VIP status, importance and sender rules feed priority scoring." actions={<Button leftIcon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => setAdding(true)}>Add contact</Button>} />
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-3 lg:col-span-2">
          <SearchInput label="Search contacts" placeholder="Name or email" onSubmit={(v) => { setQ(v); setOffset(0) }} />
          <Checkbox label="VIPs only" checked={vipOnly} onChange={(e) => { setVipOnly(e.target.checked); setOffset(0) }} />
          {contacts.isLoading ? <LoadingSkeleton variant="list" lines={6} /> : contacts.error ? <ErrorState error={contacts.error} onRetry={() => void contacts.refetch()} />
            : !contacts.data?.items.length ? <EmptyState title="No contacts" description="Contacts are created automatically from synced email." />
            : (
              <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
                {contacts.data.items.map((c) => (
                  <li key={c.id}>
                    <Link to={`/contacts/${c.id}`} aria-current={c.id === id ? 'page' : undefined} className={cn('flex items-center gap-2 px-3 py-2.5 hover:bg-surface-muted', c.id === id && 'bg-primary-soft')}>
                      <SenderIdentity name={c.display_name} email={c.email} vip={c.is_vip} size="sm" className="flex-1" />
                      <span className="text-xs text-fg-subtle tabular-nums" title="Importance">{c.importance}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          {contacts.data && <Pagination total={contacts.data.total} limit={50} offset={offset} onChange={setOffset} />}
        </div>
        <section className="lg:col-span-3" aria-label="Contact details">
          {id ? <ContactDetailPanel key={id} id={id} /> : <EmptyState title="Select a contact" description="Choose a contact to manage VIP status, sender rules and relationship memory." />}
        </section>
      </div>
      <Dialog open={adding} onClose={() => setAdding(false)} title="Add contact"
        footer={<><Button variant="secondary" onClick={() => setAdding(false)}>Cancel</Button><Button type="submit" form="contact-form" loading={create.isPending}>Add</Button></>}>
        <form id="contact-form" noValidate className="space-y-3" onSubmit={form.handleSubmit((v) => create.mutate(v))}>
          <Input label="Email" type="email" required error={form.formState.errors.email?.message} {...form.register('email')} />
          <Input label="Name" {...form.register('display_name')} />
          <Input label="Importance (0–100)" type="number" min={0} max={100} error={form.formState.errors.importance?.message} {...form.register('importance')} />
          <Checkbox label="VIP" {...form.register('is_vip')} />
        </form>
      </Dialog>
    </div>
  )
}
