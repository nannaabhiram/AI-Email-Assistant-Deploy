import { Cpu, Mail, RefreshCw, Send, ShieldAlert, Tag, Unplug } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog'
import { Pagination } from '@/components/ui/Pagination'
import { Card, EmptyState, ErrorState, LoadingSkeleton } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/hooks/useAuth'
import { keys, useAccounts, useAction, useAudit, useJobs, useLlmDiagnostics } from '@/hooks/queries'
import { api } from '@/lib/api'
import { formatDateTime, humanize, relativeTime } from '@/lib/format'
import type { ConnectedAccount } from '@/lib/types'

const OAUTH_ERRORS: Record<string, string> = {
  access_denied: 'You declined access in Google. Nothing was connected.',
  invalid_oauth_state: 'The authorization link expired or was already used. Please try again.',
  scope_not_granted: 'Gmail read permission was not granted.',
  missing_refresh_token: 'Google did not return a refresh token. Remove MailPilot from your Google account permissions and reconnect.',
}

export default function AccountSettingsPage() {
  const [params, setParams] = useSearchParams()
  const toast = useToast()
  const navigate = useNavigate()
  const { signOut } = useAuth()
  const accounts = useAccounts()
  const llm = useLlmDiagnostics()
  const jobs = useJobs()
  const [auditOffset, setAuditOffset] = useState(0)
  const audit = useAudit(auditOffset)
  const [disconnecting, setDisconnecting] = useState<ConnectedAccount | null>(null)
  const [deleteData, setDeleteData] = useState(false)
  const [deletingAccount, setDeletingAccount] = useState(false)

  useEffect(() => {
    const err = params.get('oauth_error')
    if (params.get('connected')) toast.success('Gmail connected', 'The first sync has started.')
    if (err) toast.error('Gmail connection failed', OAUTH_ERRORS[err] ?? humanize(err))
    if (params.get('connected') || err) setParams({}, { replace: true })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const connect = useAction((scope: 'readonly' | 'send' | 'modify' | 'full') => api.startOAuth(scope), {
    onSuccess: (r) => window.location.assign(r.authorization_url), errorTitle: 'Could not start Gmail authorization',
  })
  const sync = useAction((v: { id: string; mode: 'auto' | 'full' }) => api.sync(v.id, v.mode), { success: (r) => (r.status === 'already_queued' ? 'A sync is already queued' : 'Sync queued'), invalidate: [keys.accounts] })
  const disconnect = useAction((v: { id: string; del: boolean }) => api.disconnect(v.id, v.del), {
    success: 'Account disconnected and Google access revoked', invalidate: [keys.accounts, keys.me], onSuccess: () => setDisconnecting(null),
  })
  const deleteAccount = useAction(() => api.deleteMe(), { onSuccess: () => void signOut().then(() => navigate('/login')) })

  return (
    <div className="space-y-6">
      <PageHeader title="Security & connected accounts" description="Manage Gmail access, check the DGX inference connection and review the audit trail." />
      <Card title="Gmail accounts" actions={<Button size="sm" leftIcon={<Mail className="h-4 w-4" aria-hidden />} loading={connect.isPending} onClick={() => connect.mutate('readonly')}>Connect account</Button>}>
        {accounts.isLoading ? <LoadingSkeleton lines={2} /> : accounts.error ? <ErrorState error={accounts.error} onRetry={() => void accounts.refetch()} />
          : !accounts.data?.length ? <EmptyState title="No accounts connected" description="Connect Gmail with read-only access to get started." />
          : (
            <ul className="space-y-3">
              {accounts.data.map((a) => (
                <li key={a.id} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-fg">{a.email_address}</p>
                    <Badge tone={a.status === 'active' ? 'success' : a.status === 'needs_reauth' ? 'warning' : 'neutral'}>{humanize(a.status)}</Badge>
                    <Badge tone="outline">Read</Badge>
                    {a.can_send && <Badge tone="outline">Send (with approval)</Badge>}
                    {a.can_modify && <Badge tone="outline">Labels/archive (with approval)</Badge>}
                  </div>
                  {a.last_error && <p className="mt-1 text-xs text-danger">{a.last_error}</p>}
                  {a.sync && (
                    <p className="mt-1 text-xs text-fg-muted">
                      Sync {a.sync.status} · last success {a.sync.last_successful_sync_at ? relativeTime(a.sync.last_successful_sync_at) : 'never'} · {a.sync.messages_synced} messages
                      {a.sync.last_error && <span className="block text-danger">Last error: {a.sync.last_error}</span>}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {a.status === 'active' ? (<>
                      <Button size="sm" variant="secondary" leftIcon={<RefreshCw className="h-4 w-4" aria-hidden />} onClick={() => sync.mutate({ id: a.id, mode: 'auto' })}>Sync now</Button>
                      <Button size="sm" variant="ghost" onClick={() => sync.mutate({ id: a.id, mode: 'full' })}>Full resync</Button>
                    </>) : (
                      <Button size="sm" onClick={() => connect.mutate('readonly')}>Reconnect</Button>
                    )}
                    {!a.can_send && <Button size="sm" variant="ghost" leftIcon={<Send className="h-4 w-4" aria-hidden />} onClick={() => connect.mutate('send')}>Allow sending</Button>}
                    {!a.can_modify && <Button size="sm" variant="ghost" leftIcon={<Tag className="h-4 w-4" aria-hidden />} onClick={() => connect.mutate('modify')}>Allow labels/archive</Button>}
                    {a.status !== 'disconnected' && <Button size="sm" variant="ghost" className="text-danger" leftIcon={<Unplug className="h-4 w-4" aria-hidden />} onClick={() => setDisconnecting(a)}>Disconnect</Button>}
                  </div>
                </li>
              ))}
            </ul>
          )}
      </Card>

      <Card title="DGX Spark inference" actions={<Button size="sm" variant="ghost" loading={llm.isFetching} onClick={() => void llm.refetch()} leftIcon={<Cpu className="h-4 w-4" aria-hidden />}>Re-check</Button>}>
        {llm.isLoading ? <LoadingSkeleton lines={3} /> : llm.error ? <ErrorState error={llm.error} /> : llm.data && (
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div><dt className="text-fg-muted">Status</dt><dd>{!llm.data.configured ? <Badge tone="warning">Not configured</Badge> : llm.data.reachable ? <Badge tone="success">Reachable</Badge> : <Badge tone="danger">Unreachable</Badge>}</dd></div>
            <div><dt className="text-fg-muted">Endpoint</dt><dd className="font-mono text-fg">{llm.data.endpoint_host ?? '—'}{llm.data.via_ssh_tunnel && ' (SSH tunnel)'}</dd></div>
            <div><dt className="text-fg-muted">Model</dt><dd className="text-fg">{llm.data.configured_model ?? '—'} {llm.data.reachable && (llm.data.model_available ? <Badge tone="success">served</Badge> : <Badge tone="danger">not served</Badge>)}</dd></div>
            <div><dt className="text-fg-muted">Latency</dt><dd className="text-fg">{llm.data.latency_ms != null ? `${llm.data.latency_ms} ms` : '—'}</dd></div>
            <div><dt className="text-fg-muted">Structured output</dt><dd className="text-fg">{llm.data.structured_output_mode}</dd></div>
            <div><dt className="text-fg-muted">When unavailable</dt><dd className="text-fg">{llm.data.fallback_mode === 'rules' ? 'Labelled rule-based results; AI requeued' : 'Queue until available'}</dd></div>
            {llm.data.error && <div className="sm:col-span-2"><dt className="text-fg-muted">Error</dt><dd className="text-danger">{llm.data.error}</dd></div>}
            <p className="text-xs text-fg-subtle sm:col-span-2">Email content is only ever sent to this endpoint, never to a public cloud model. Configure it in backend/.env (see docs/DGX_SPARK.md).</p>
          </dl>
        )}
      </Card>

      <Card title="Background jobs">
        {jobs.data?.length ? (
          <ul className="max-h-64 space-y-1 overflow-y-auto text-sm">
            {jobs.data.map((j) => (
              <li key={j.id} className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-fg-muted">#{j.id}</span><span className="text-fg">{humanize(j.job_type)}</span>
                <Badge tone={j.status === 'succeeded' ? 'success' : j.status === 'running' ? 'info' : j.status === 'queued' ? 'neutral' : 'danger'}>{j.status}</Badge>
                <span className="text-xs text-fg-subtle">{relativeTime(j.created_at)} · attempt {j.attempts}/{j.max_attempts}</span>
                {j.last_error && <span className="w-full text-xs text-danger">{j.last_error}</span>}
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-fg-muted">No recent jobs.</p>}
      </Card>

      <Card title="Audit log" description="Sensitive operations: connections, approvals, sends, settings changes.">
        {audit.isLoading ? <LoadingSkeleton lines={4} /> : audit.data?.items.length ? (
          <>
            <ul className="divide-y divide-border text-sm">
              {audit.data.items.map((e) => (
                <li key={e.id} className="flex flex-wrap gap-x-3 py-1.5">
                  <time className="w-40 shrink-0 text-xs text-fg-subtle" dateTime={e.created_at}>{formatDateTime(e.created_at)}</time>
                  <span className="font-medium text-fg">{e.event}</span>
                  <span className="text-xs text-fg-muted">{e.actor}{e.entity_type ? ` · ${e.entity_type}` : ''}</span>
                </li>
              ))}
            </ul>
            <Pagination total={audit.data.total} limit={50} offset={auditOffset} onChange={setAuditOffset} />
          </>
        ) : <p className="text-sm text-fg-muted">No events yet.</p>}
      </Card>

      <Card title="Danger zone">
        <div className="flex flex-wrap items-center gap-3">
          <ShieldAlert className="h-5 w-5 text-danger" aria-hidden />
          <p className="flex-1 text-sm text-fg-muted">Delete your MailPilot account: revokes Google access, removes all synced data, analyses, drafts and stored attachments.</p>
          <Button variant="danger" onClick={() => setDeletingAccount(true)}>Delete account</Button>
        </div>
      </Card>

      <ConfirmationDialog open={disconnecting !== null} title={`Disconnect ${disconnecting?.email_address ?? ''}?`}
        description="MailPilot revokes its Google access and stops syncing." confirmLabel="Disconnect" destructive loading={disconnect.isPending}
        onCancel={() => setDisconnecting(null)} onConfirm={() => disconnecting && disconnect.mutate({ id: disconnecting.id, del: deleteData })}>
        <Checkbox label="Also delete all synced email data for this account" checked={deleteData} onChange={(e) => setDeleteData(e.target.checked)} />
      </ConfirmationDialog>
      <ConfirmationDialog open={deletingAccount} title="Delete your account permanently?" description="This cannot be undone." destructive requireText="DELETE"
        confirmLabel="Delete account" loading={deleteAccount.isPending} onCancel={() => setDeletingAccount(false)} onConfirm={() => deleteAccount.mutate(undefined)} />
    </div>
  )
}
