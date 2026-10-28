import { Paperclip } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { AttachmentCard } from '@/components/mail/AttachmentCard'
import { Select } from '@/components/ui/Select'
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/ui/States'
import { useAction, useAttachments } from '@/hooks/queries'
import { api } from '@/lib/api'

const STATUSES = [
  { value: '', label: 'All attachments' },
  { value: 'done', label: 'Analysed' },
  { value: 'not_requested', label: 'Not analysed' },
  { value: 'pending', label: 'Analysing' },
  { value: 'failed', label: 'Failed' },
  { value: 'blocked', label: 'Blocked (dangerous)' },
]

export default function AttachmentsPage() {
  const [status, setStatus] = useState('')
  const list = useAttachments(status || undefined)
  const extract = useAction((id: string) => api.extractAttachment(id), { success: 'Analysis started', invalidate: [['attachments']] })
  const download = useAction((id: string) => api.attachmentUrl(id), { onSuccess: (r) => window.open(r.url, '_blank', 'noopener,noreferrer') })
  return (
    <div className="space-y-4">
      <PageHeader title="Attachment analysis" description="PDF, text, CSV and Word documents are parsed safely on the server. Files are never opened or executed in your browser, and embedded links are never followed." />
      <div className="max-w-xs"><Select label="Show" options={STATUSES} value={status} onChange={(e) => setStatus(e.target.value)} /></div>
      {list.isLoading ? <LoadingSkeleton variant="card" lines={3} /> : list.error ? <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        : !list.data?.items.length ? <EmptyState title="No attachments" icon={<Paperclip className="h-6 w-6" aria-hidden />} description="Attachments from synced email appear here." />
        : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {list.data.items.map((a) => (
              <li key={a.id} className="space-y-1">
                <AttachmentCard attachment={a} expanded onExtract={(id) => extract.mutate(id)} onDownload={(id) => download.mutate(id)}
                  extracting={extract.isPending && extract.variables === a.id} />
                <Link to={`/inbox/${a.message_id}`} className="text-xs text-primary hover:underline">Open source email</Link>
              </li>
            ))}
          </ul>
        )}
    </div>
  )
}
