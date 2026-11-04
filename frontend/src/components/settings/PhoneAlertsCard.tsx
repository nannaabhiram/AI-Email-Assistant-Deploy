import { useQuery } from '@tanstack/react-query'
import { BellRing } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, ErrorState, LoadingSkeleton } from '@/components/ui/States'
import { keys, useAction } from '@/hooks/queries'
import { api } from '@/lib/api'

export function PhoneAlertsCard() {
  const alerts = useQuery({ queryKey: keys.phoneAlerts, queryFn: api.phoneAlerts })
  const enable = useAction(() => api.enablePhoneAlerts(), { success: 'Phone alerts enabled', invalidate: [keys.phoneAlerts, keys.settings] })
  const disable = useAction(() => api.disablePhoneAlerts(), { success: 'Phone alerts turned off', invalidate: [keys.phoneAlerts, keys.settings] })
  const test = useAction(() => api.testPhoneAlert(), { success: 'Test alert sent to your phone', errorTitle: 'Test alert failed' })
  const data = alerts.data

  return (
    <Card title="Phone alerts" description="Internship and job offers, offer letters, selections and interview calls are always top priority and ping your phone instantly.">
      {alerts.isLoading ? <LoadingSkeleton lines={2} /> : alerts.error || !data ? (
        <ErrorState error={alerts.error} onRetry={() => void alerts.refetch()} />
      ) : !data.enabled ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="flex-1 text-sm text-fg-muted">Free, no account needed. Uses the ntfy app on Android or iPhone.</p>
          <Button leftIcon={<BellRing className="h-4 w-4" />} loading={enable.isPending} onClick={() => enable.mutate(undefined)}>Enable phone alerts</Button>
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          <ol className="list-decimal space-y-1 pl-5 text-fg-muted">
            <li>Install <strong className="text-fg">ntfy</strong> from the <a className="text-primary underline" href="https://play.google.com/store/apps/details?id=io.heckel.ntfy" target="_blank" rel="noreferrer">Play Store</a> or <a className="text-primary underline" href="https://apps.apple.com/app/ntfy/id1625396347" target="_blank" rel="noreferrer">App Store</a>.</li>
            <li>Tap <strong className="text-fg">+</strong>, subscribe to this private topic, then tap Test.</li>
          </ol>
          <div className="flex flex-wrap items-center gap-2">
            <code className="flex-1 select-all break-all rounded-md bg-surface-muted px-3 py-2 text-fg">{data.topic}</code>
            <Button size="sm" variant="secondary" onClick={() => void navigator.clipboard?.writeText(data.topic ?? '')}>Copy</Button>
            {data.subscribe_url && <a className="text-sm text-primary underline" href={data.subscribe_url} target="_blank" rel="noreferrer">Open on phone</a>}
          </div>
          <p className="text-xs text-fg-subtle">Keep the topic secret: anyone with it can read your alerts. Alerts include only the subject and sender.</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" loading={test.isPending} onClick={() => test.mutate(undefined)}>Send test alert</Button>
            <Button size="sm" variant="ghost" loading={disable.isPending} onClick={() => disable.mutate(undefined)}>Turn off</Button>
          </div>
        </div>
      )}
    </Card>
  )
}
