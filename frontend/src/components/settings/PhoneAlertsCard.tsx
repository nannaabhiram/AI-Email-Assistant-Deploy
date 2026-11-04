import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BellRing, Send } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, ErrorState, LoadingSkeleton } from '@/components/ui/States'
import { keys, useAction } from '@/hooks/queries'
import { api } from '@/lib/api'

export function PhoneAlertsCard() {
  const [botToken, setBotToken] = useState('')
  const qc = useQueryClient()
  const alerts = useQuery({ queryKey: keys.phoneAlerts, queryFn: api.phoneAlerts })
  const data = alerts.data
  const pending = Boolean(data?.telegram_link && !data.telegram_connected)
  useQuery({
    queryKey: ['telegram-verify'], enabled: pending, refetchInterval: 3000, gcTime: 0,
    queryFn: async () => { const r = await api.verifyTelegram(); qc.setQueryData(keys.phoneAlerts, r); return r },
  })
  const inv = [keys.phoneAlerts, keys.settings]
  const saveBot = useAction((t: string) => api.setTelegramBot(t), {
    invalidate: inv, errorTitle: 'Could not use that bot', onSuccess: (r) => { setBotToken(''); if (r.telegram_link) window.open(r.telegram_link, '_blank', 'noopener') },
  })
  const unlink = useAction(() => api.unlinkTelegram(), { success: 'Telegram bot removed', invalidate: inv })
  const enable = useAction(() => api.enablePhoneAlerts(), { success: 'ntfy alerts enabled', invalidate: inv })
  const disable = useAction(() => api.disablePhoneAlerts(), { success: 'ntfy alerts turned off', invalidate: inv })
  const test = useAction(() => api.testPhoneAlert(), { success: 'Test alert sent to your phone', errorTitle: 'Test alert failed' })

  return (
    <Card title="Phone alerts" description="Internship and job offers, offer letters, selections and interview calls are always top priority and ping your phone instantly.">
      {alerts.isLoading ? <LoadingSkeleton lines={2} /> : alerts.error || !data ? (
        <ErrorState error={alerts.error} onRetry={() => void alerts.refetch()} />
      ) : (
        <div className="space-y-4 text-sm">
          {data.telegram_connected ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="flex-1 text-fg"><strong>Telegram connected</strong> <span className="text-fg-muted">via @{data.telegram_bot}</span></p>
              <Button size="sm" loading={test.isPending} onClick={() => test.mutate(undefined)}>Send test alert</Button>
              <Button size="sm" variant="ghost" loading={unlink.isPending} onClick={() => unlink.mutate(undefined)}>Remove bot</Button>
            </div>
          ) : pending ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="flex-1 text-fg-muted">Open <strong className="text-fg">@{data.telegram_bot}</strong> and tap <strong className="text-fg">Start</strong>. This connects automatically…</p>
              <a className="text-primary underline" href={data.telegram_link!} target="_blank" rel="noreferrer">Open @{data.telegram_bot}</a>
              <Button size="sm" variant="ghost" loading={unlink.isPending} onClick={() => unlink.mutate(undefined)}>Cancel</Button>
            </div>
          ) : (
            <div className="space-y-2">
              <ol className="list-decimal space-y-1 pl-5 text-fg-muted">
                <li>In Telegram, open <a className="text-primary underline" href="https://t.me/BotFather" target="_blank" rel="noreferrer">@BotFather</a>, send <code>/newbot</code> and follow the steps.</li>
                <li>Paste the bot token here. It is stored encrypted and only used to message you.</li>
              </ol>
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[16rem] flex-1">
                  <Input label="Bot token" type="password" autoComplete="off" placeholder="123456789:AA..." value={botToken} onChange={(e) => setBotToken(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (botToken.trim()) saveBot.mutate(botToken.trim()) } }} />
                </div>
                <Button leftIcon={<Send className="h-4 w-4" />} loading={saveBot.isPending} disabled={!botToken.trim()} onClick={() => saveBot.mutate(botToken.trim())}>Connect bot</Button>
              </div>
            </div>
          )}
          <details className="rounded-md border border-border px-3 py-2" >
            <summary className="cursor-pointer text-fg-muted">Or use the ntfy app</summary>
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
