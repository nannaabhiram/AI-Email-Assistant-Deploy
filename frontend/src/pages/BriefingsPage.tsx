import { useState } from 'react'
import { Link } from 'react-router'
import { DailyBriefingCard } from '@/components/insights/DailyBriefingCard'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { ErrorState, LoadingSkeleton } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { keys, useAction, useBriefings, useJobWatcher, useSettings } from '@/hooks/queries'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { formatDate } from '@/lib/format'

export default function BriefingsPage() {
  const briefings = useBriefings()
  const settings = useSettings()
  const [selected, setSelected] = useState<string | null>(null)
  const toast = useToast()
  const job = useJobWatcher([keys.briefings, keys.latestBriefing], () => {
    setSelected(null) // show the fresh briefing
    toast.success('Briefing ready')
  })
  const generate = useAction(() => api.generateBriefing(), { onSuccess: (r) => job.watch(r.job_id) })
  const busy = generate.isPending || job.running
  const progress = job.job?.status === 'running' ? 'Generating your briefing…'
    : job.running ? 'Queued. Waiting for the background worker to start it…' : null
  const items = briefings.data?.items ?? []
  const current = items.find((b) => b.id === selected) ?? items[0] ?? null

  return (
    <div>
      <PageHeader
        title="Daily briefings"
        description={settings.data ? (settings.data.briefing_enabled
          ? `Generated daily at ${settings.data.briefing_time.slice(0, 5)} (${settings.data.timezone}).`
          : 'Automatic briefings are turned off.') : undefined}
        actions={<>
          <Link to="/settings/preferences" className="self-center text-sm text-primary hover:underline">Briefing settings</Link>
          <Button onClick={() => generate.mutate(undefined)} loading={busy} disabled={busy}>Generate now</Button>
        </>}
      />
      {progress && <p role="status" className="mb-4 text-sm text-fg-muted">{progress}</p>}
      {briefings.isLoading ? <LoadingSkeleton variant="card" lines={2} /> : briefings.error ? <ErrorState error={briefings.error} onRetry={() => void briefings.refetch()} /> : (
        <div className="grid gap-6 lg:grid-cols-4">
          <nav aria-label="Past briefings" className="lg:col-span-1">
            <ul className="space-y-1">
              {items.map((b) => (
                <li key={b.id}>
                  <button type="button" aria-current={current?.id === b.id || undefined} onClick={() => setSelected(b.id)}
                    className={cn('w-full rounded-md px-3 py-2 text-left text-sm', current?.id === b.id ? 'bg-primary-soft font-medium text-primary' : 'text-fg-muted hover:bg-surface-muted')}>
                    {formatDate(b.briefing_date, { weekday: 'short', day: 'numeric', month: 'short' })}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          <div className="lg:col-span-3">
            <DailyBriefingCard briefing={current} onGenerate={() => generate.mutate(undefined)} generating={busy} />
          </div>
        </div>
      )}
    </div>
  )
}
