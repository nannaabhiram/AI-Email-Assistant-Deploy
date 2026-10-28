import { cn } from '@/lib/cn'
import { pct } from '@/lib/format'

export interface PriorityScoreProps {
  score: number
  confidence?: number | string | null
  components?: Record<string, number | string[]>
  showBreakdown?: boolean
  className?: string
}

const COMPONENT_LABELS: Record<string, string> = {
  deadline: 'Deadline urgency',
  action: 'Action required',
  impact: 'Impact if ignored',
  sender: 'Sender importance',
  context: 'Conversation context',
}

function barTone(v: number): string {
  return v >= 70 ? 'bg-high' : v >= 40 ? 'bg-medium' : 'bg-low'
}

export function PriorityScore({ score, confidence, components, showBreakdown = false, className }: PriorityScoreProps) {
  const lowConfidence = confidence !== null && confidence !== undefined && Number(confidence) < 0.55
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-center gap-3">
        <div
          role="meter"
          aria-label="Priority score"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={score}
          className="h-2 flex-1 overflow-hidden rounded-full bg-surface-muted"
        >
          <div className={cn('h-full rounded-full', barTone(score))} style={{ width: `${score}%` }} />
        </div>
        <span className="w-14 text-right text-sm font-semibold tabular-nums text-fg">{score}/100</span>
      </div>
      {confidence !== undefined && confidence !== null && (
        <p className={cn('text-xs', lowConfidence ? 'font-medium text-warning' : 'text-fg-subtle')}>
          Confidence {pct(confidence)}{lowConfidence && ' — low confidence, please review'}
        </p>
      )}
      {showBreakdown && components && (
        <dl className="grid grid-cols-1 gap-1.5">
          {Object.entries(COMPONENT_LABELS).map(([key, label]) => {
            const v = components[key]
            if (typeof v !== 'number') return null
            return (
              <div key={key} className="flex items-center gap-2 text-xs">
                <dt className="w-36 shrink-0 text-fg-muted">{label}</dt>
                <dd className="flex flex-1 items-center gap-2">
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted">
                    <span className={cn('block h-full', barTone(v))} style={{ width: `${v}%` }} />
                  </span>
                  <span className="w-7 text-right tabular-nums text-fg">{v}</span>
                </dd>
              </div>
            )
          })}
        </dl>
      )}
    </div>
  )
}
