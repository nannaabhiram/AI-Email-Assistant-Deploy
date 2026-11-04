import { useQuery } from '@tanstack/react-query'
import { BellRing, Send } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card, ErrorState, LoadingSkeleton } from '@/components/ui/States'
import { keys, useAction } from '@/hooks/queries'
import { api } from '@/lib/api'

export function PhoneAlertsCard() {
  const [linking, setLinking] = useState(false)
  const alerts = useQuery({ queryKey: keys.phoneAlerts, queryFn: api.phoneAlerts, refetchInterval: linking ? 3000 : false })
  const inv = [keys.phoneAlerts, keys.settings]
  const connect = useAction(() => api.linkTelegram(), {
    invalidate: inv, errorTitle: 'Could not start Telegram linking',
    onSuccess: ({ link }) => { setLinking(true); if (!window.open(link, '_blank', 'noopener')) window.location.href = link },
  })
  const unlink = useAction(() => api.unlinkTelegram(), { success: 'Telegram disconnected', invalidate: inv })
  const enable = useAction(() => api.enablePhoneAlerts(), { success: 'ntfy alerts enabled', invalidate: inv })
  const disable = useAction(() => api.disablePhoneAlerts(), { success: 'ntfy alerts turned off', invalidate: inv })
  const test = useAction(() => api.testPhoneAlert(), { success: 'Test alert sent to your phone', errorTitle: 'Test alert failed' })
  const data = alerts.data
  if (linking && data?.telegram_connected) setLinking(false)

  return (
    <Card title="Phone alerts" description="Internship and job offers, offer letters, selections and interview calls are always top priority and ping your phone instantly.">
      {alerts.isLoading ? <LoadingSkeleton lines={2} /> : alerts.error || !data ? (
        <ErrorState error={alerts.error} onRetry={() => void alerts.refetch()} />
      ) : (
        <div className="space-y-4 text-sm">
          {data.telegram_available && (
            <div className="flex flex-wrap items-center gap-3">
              {data.telegram_connected ? (
                <>
                  <p className="flex-1 text-fg"><strong>Telegram connected.</strong> <span className="text-fg-muted">Alerts arrive as messages from your MailPilot bot.</span></p>
                  <Button size="sm" loading={test.isPending} onClick={() => test.mutate(undefined)}>Send test alert</Button>
                  <Button size="sm" variant="ghost" loading={unlink.isPending} onClick={() => unlink.mutate(undefined)}>Disconnect</Button>
                </>
              ) : (
                <>
                  <p className="flex-1 text-fg-muted">{linking ? 'Tap Start in Telegram to finish connecting…' : 'Free, works on Android and iPhone. Opens Telegram; tap Start.'}</p>
                  <Button leftIcon={<Send className="h-4 w-4" />} loading={connect.isPending} onClick={() => connect.mutate(undefined)}>Connect Telegram</Button>
                </>
              )}
            </div>
          )}
          <details className="rounded-md border border-border px-3 py-2" open={!data.telegram_available}>
            <summary className="cursor-pointer text-fg-muted">{data.telegram_available ? 'Or use the ntfy app' : 'ntfy app'}</summary>
            <div className="mt-3 space-y-3">
              {!data.enabled ? (
                <div className="flex flex-wrap items-center gap-3">
                  <p className="flex-1 text-fg-muted">Uses the free ntfy app. Shared servers can hit ntfy.sh's daily limit.</p>
                  <Button size="sm" variant="secondary" leftIcon={<BellRing className="h-4 w-4" />} loading={enable.isPending} onClick={() => enable.mutate(undefined)}>Enable ntfy</Button>
                </div>
              ) : (
                <>
                  <ol className="list-decimal space-y-1 pl-5 text-fg-muted">
                    <li>Install <strong className="text-fg">ntfy</strong> from the <a className="text-primary underline" href="https://play.google.com/store/apps/details?id=io.heckel.ntfy" target="_blank" rel="noreferrer">Play Store</a> or <a className="text-primary underline" href="https://apps.apple.com/app/ntfy/id1625396347" target="_blank" rel="noreferrer">App Store</a>.</li>
                    <li>Tap <strong className="text-fg">+</strong> and subscribe to this private topic.</li>
                  </ol>
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="flex-1 select-all break-all rounded-md bg-surface-muted px-3 py-2 text-fg">{data.topic}</code>
                    <Button size="sm" variant="secondary" onClick={() => void navigator.clipboard?.writeText(data.topic ?? '')}>Copy</Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {!data.telegram_connected && <Button size="sm" loading={test.isPending} onClick={() => test.mutate(undefined)}>Send test alert</Button>}
                    <Button size="sm" variant="ghost" loading={disable.isPending} onClick={() => disable.mutate(undefined)}>Turn off ntfy</Button>
                  </div>
                </>
              )}
            </div>
          </details>
          <p className="text-xs text-fg-subtle">Alerts include only the subject and sender.</p>
        </div>
      )}
    </Card>
  )
}
