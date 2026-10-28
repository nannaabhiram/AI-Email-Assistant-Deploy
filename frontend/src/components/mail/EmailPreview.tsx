import { AlertTriangle, ExternalLink, Info, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { humanize } from '@/lib/format'
import type { Analysis, EmailDetail } from '@/lib/types'
import { DeadlineIndicator } from './DeadlineIndicator'
import { PriorityScore } from './PriorityScore'

export function RiskPanel({ analysis }: { analysis: Analysis }) {
  const risky = analysis.risk_flags.length > 0
  return (
    <section
      aria-label="Security analysis"
      className={cn('rounded-lg border p-3 text-sm', risky ? 'border-danger/40 bg-danger-soft' : 'border-border bg-surface-muted')}
    >
      <h3 className="flex items-center gap-1.5 font-semibold text-fg">
        {risky ? <AlertTriangle className="h-4 w-4 text-danger" aria-hidden /> : <ShieldCheck className="h-4 w-4 text-success" aria-hidden />}
        {risky ? `Security warnings (${humanize(analysis.risk_level)} risk)` : 'No risk indicators detected'}
      </h3>
      {risky && (
        <ul className="mt-2 space-y-1">
          {analysis.risk_flags.map((f, i) => (
            <li key={i} className="text-fg"><span className="font-medium">{humanize(f.code)}:</span> {f.detail}{f.source === 'llm' && <span className="text-fg-subtle"> (AI)</span>}</li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-fg-muted">
        Automated checks can miss threats. No detected risk does not guarantee an email is safe. Never act on payment or
        credential requests without verifying through a known channel.
      </p>
    </section>
  )
}

export function AnalysisPanel({ analysis }: { analysis: Analysis }) {
  return (
    <section aria-label="AI analysis" className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <div>
        <h3 className="text-xs font-semibold tracking-wide text-fg-muted uppercase">Summary</h3>
        <p className="mt-1 text-sm text-fg">{analysis.summary}</p>
      </div>
      <PriorityScore score={analysis.priority_score} confidence={analysis.confidence} components={analysis.components} showBreakdown />
      <div>
        <h3 className="text-xs font-semibold tracking-wide text-fg-muted uppercase">Why this priority</h3>
        <p className="mt-1 text-sm text-fg">{analysis.explanation}</p>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <p><span className="text-fg-muted">Reply needed:</span> <strong>{analysis.reply_needed ? 'Yes' : 'No'}</strong></p>
        <p><span className="text-fg-muted">Action required:</span> <strong>{analysis.action_required ? 'Yes' : 'No'}</strong></p>
        {analysis.deadline_at && <DeadlineIndicator dueAt={analysis.deadline_at} dateType={analysis.deadline_type} text={analysis.deadline_text} />}
      </div>
      {analysis.suggested_action && (
        <p className="rounded-md bg-primary-soft px-3 py-2 text-sm text-fg"><span className="font-semibold text-primary">Suggested: </span>{analysis.suggested_action}</p>
      )}
      {analysis.needs_review && (
        <p className="flex items-start gap-1.5 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> Flagged for review: the evidence is ambiguous or signals disagree.
        </p>
      )}
      {(analysis.entities.amounts?.length ?? 0) > 0 && (
        <p className="text-sm text-fg-muted"><span className="font-medium text-fg">Amounts:</span> {analysis.entities.amounts!.map((a) => `${a.currency ?? ''} ${a.value}`).join(', ')}</p>
      )}
      <p className="text-xs text-fg-subtle">
        {analysis.source === 'rules' ? 'Deterministic rule-based result (remote AI was unavailable).' : `Analysed by ${analysis.model ?? 'remote model'} with rule-based checks.`}
      </p>
    </section>
  )
}

export interface EmailPreviewProps {
  email: EmailDetail
  className?: string
}

/** Renders the email body as plain text (HTML is never rendered). Links are listed, not auto-opened. */
export function EmailPreview({ email, className }: EmailPreviewProps) {
  const [showLinks, setShowLinks] = useState(false)
  return (
    <div className={cn('space-y-3', className)}>
      <div className="rounded-lg border border-border bg-surface p-4">
        <pre className="font-sans text-sm leading-relaxed break-words whitespace-pre-wrap text-fg">{email.body_text || '(empty message)'}</pre>
        {email.has_html && <p className="mt-3 text-xs text-fg-subtle">Shown as plain text for safety. Remote images and scripts are never loaded.</p>}
      </div>
      {email.links.length > 0 && (
        <div>
          <Button variant="ghost" size="sm" aria-expanded={showLinks} onClick={() => setShowLinks((s) => !s)}>
            {showLinks ? 'Hide' : 'Show'} {email.links.length} link(s) in this email
          </Button>
          {showLinks && (
            <ul className="mt-2 space-y-1 text-xs">
              {email.links.slice(0, 50).map((l, i) => (
                <li key={i} className="flex items-start gap-1.5 break-all text-fg-muted">
                  <ExternalLink className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                  <span>{l.text && <span className="text-fg">{l.text} → </span>}<span className="font-mono">{l.url}</span></span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
