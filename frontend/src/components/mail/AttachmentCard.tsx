import { AlertTriangle, Ban, Download, FileText, Loader2, ScanSearch } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { formatBytes, humanize } from '@/lib/format'
import type { Attachment } from '@/lib/types'

export interface AttachmentCardProps {
  attachment: Attachment
  onExtract?: (id: string) => void
  onDownload?: (id: string) => void
  extracting?: boolean
  expanded?: boolean
  className?: string
}

const STATUS: Record<Attachment['extraction_status'], { label: string; tone: 'neutral' | 'info' | 'success' | 'danger' | 'warning' }> = {
  not_requested: { label: 'Not analysed', tone: 'neutral' },
  pending: { label: 'Analysing', tone: 'info' },
  done: { label: 'Analysed', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
  unsupported: { label: 'Unsupported type', tone: 'neutral' },
  too_large: { label: 'Too large', tone: 'warning' },
  blocked: { label: 'Blocked', tone: 'danger' },
}

export function AttachmentCard({ attachment: a, onExtract, onDownload, extracting = false, expanded = false, className }: AttachmentCardProps) {
  const status = STATUS[a.extraction_status]
  const llm = a.extraction.llm
  const det = a.extraction.deterministic
  const canExtract = ['not_requested', 'failed', 'done'].includes(a.extraction_status)
  return (
    <article className={cn('rounded-lg border border-border bg-surface p-3', className)} aria-label={`Attachment ${a.filename}`}>
      <div className="flex items-start gap-3">
        <div className="rounded-md bg-surface-muted p-2 text-fg-muted">
          {a.extraction_status === 'blocked' ? <Ban className="h-5 w-5 text-danger" aria-hidden /> : <FileText className="h-5 w-5" aria-hidden />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-fg" title={a.filename}>{a.filename}</p>
          <p className="text-xs text-fg-subtle">{a.mime_type} · {formatBytes(a.size_bytes)}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Badge tone={status.tone} icon={a.extraction_status === 'pending' ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : undefined}>{status.label}</Badge>
            {a.extraction.source === 'rules' && a.extraction_status === 'done' && <Badge tone="outline">Rule-based extraction</Badge>}
            {llm && <Badge tone="primary">{humanize(llm.document_type)}</Badge>}
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          {onExtract && canExtract && (
            <Button size="sm" variant="secondary" loading={extracting} onClick={() => onExtract(a.id)} leftIcon={<ScanSearch className="h-4 w-4" aria-hidden />}>
              {a.extraction_status === 'done' ? 'Re-analyse' : 'Analyse'}
            </Button>
          )}
          {onDownload && a.stored && (
            <Button size="sm" variant="ghost" onClick={() => onDownload(a.id)} aria-label={`Download ${a.filename}`}>
              <Download className="h-4 w-4" aria-hidden />
            </Button>
          )}
        </div>
      </div>
      {a.extraction_error && <p className="mt-2 text-xs text-danger">{a.extraction_error}</p>}
      {a.risk_flags.length > 0 && (
        <ul className="mt-2 space-y-1">
          {a.risk_flags.map((f, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs text-danger"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />{f.detail}</li>
          ))}
        </ul>
      )}
      {expanded && a.extraction_status === 'done' && (
        <div className="mt-3 space-y-2 border-t border-border pt-3 text-sm">
          {llm?.summary && <p className="text-fg">{llm.summary}</p>}
          <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
            {(llm?.invoice_numbers?.length || det?.invoice_numbers?.length) ? (
              <><dt className="text-xs text-fg-subtle">Invoice numbers</dt><dd className="text-xs text-fg">{(llm?.invoice_numbers?.length ? llm.invoice_numbers : det?.invoice_numbers ?? []).join(', ')}</dd></>
            ) : null}
            {det?.quotation_refs?.length ? (<><dt className="text-xs text-fg-subtle">Quotation refs</dt><dd className="text-xs text-fg">{det.quotation_refs.join(', ')}</dd></>) : null}
            {(llm?.amounts ?? det?.amounts ?? []).slice(0, 6).map((amt, i) => (
              <div key={i} className="contents"><dt className="text-xs text-fg-subtle">Amount</dt><dd className="text-xs text-fg">{amt.currency} {amt.value}</dd></div>
            ))}
            {(llm?.deadlines ?? det?.deadlines ?? []).slice(0, 4).map((d, i) => (
              <div key={`d${i}`} className="contents"><dt className="text-xs text-fg-subtle">Deadline</dt><dd className="text-xs text-fg">{d.description}</dd></div>
            ))}
          </dl>
          {llm?.deliverables && llm.deliverables.length > 0 && <p className="text-xs text-fg-muted"><span className="font-medium">Deliverables:</span> {llm.deliverables.join('; ')}</p>}
          {llm?.inconsistencies && llm.inconsistencies.length > 0 && (
            <p className="rounded bg-warning-soft px-2 py-1 text-xs text-warning"><span className="font-semibold">Possible inconsistencies:</span> {llm.inconsistencies.join('; ')}</p>
          )}
          {a.extraction.meta?.ocr === true && <p className="text-xs text-warning">Text came from OCR and may contain recognition errors.</p>}
        </div>
      )}
    </article>
  )
}
