import { CheckCircle2, Eye, Lock, Mail, Send, Server, Tag } from 'lucide-react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/States'
import { useAction, useAccounts } from '@/hooks/queries'
import { api } from '@/lib/api'

function Permission({ icon, title, scope, children, required }: { icon: ReactNode; title: string; scope: string; children: ReactNode; required?: boolean }) {
  return (
    <li className="flex gap-3 rounded-lg border border-border p-3">
      <span className="mt-0.5 text-primary" aria-hidden>{icon}</span>
      <div>
        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-fg">{title}{required ? <Badge tone="primary">Needed now</Badge> : <Badge tone="outline">Optional, later</Badge>}</p>
        <p className="font-mono text-xs text-fg-subtle">{scope}</p>
        <p className="mt-1 text-sm text-fg-muted">{children}</p>
      </div>
    </li>
  )
}

export default function OnboardingPage() {
  const navigate = useNavigate()
  const accounts = useAccounts()
  const connect = useAction(() => api.startOAuth('readonly', '/onboarding'), {
    onSuccess: (r) => { window.location.assign(r.authorization_url) },
    errorTitle: 'Could not start Gmail authorization',
  })
  const connected = accounts.data?.filter((a) => a.status === 'active') ?? []
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Connect your Gmail" description="MailPilot starts with read-only access. Extra permissions are requested only when you use a feature that needs them." />
      {connected.length > 0 && (
        <div role="status" className="mb-4 flex flex-wrap items-center gap-2 rounded-lg bg-success-soft p-3 text-sm text-success">
          <CheckCircle2 className="h-4 w-4" aria-hidden /> Connected {connected.map((a) => a.email_address).join(', ')}. The first sync is running in the background.
          <Button size="sm" className="ml-auto" onClick={() => navigate('/dashboard')}>Go to dashboard</Button>
        </div>
      )}
      <Card title="What MailPilot will be able to do">
        <ul className="space-y-2">
          <Permission icon={<Eye className="h-5 w-5" />} title="Read your mail" scope="gmail.readonly" required>
            Sync messages and attachment metadata so MailPilot can prioritise, summarise and extract tasks.
          </Permission>
          <Permission icon={<Send className="h-5 w-5" />} title="Send replies you approve" scope="gmail.send">
            Requested only when you first send a reply. Every message needs your explicit approval of the exact recipients and text.
          </Permission>
          <Permission icon={<Tag className="h-5 w-5" />} title="Label, archive and mark read" scope="gmail.modify">
            Requested only if you want to apply organisation suggestions. Each change is previewed and approved first.
          </Permission>
        </ul>
        <ul className="mt-4 space-y-1.5 text-sm text-fg-muted">
          <li className="flex gap-2"><Server className="h-4 w-4 shrink-0 text-fg-subtle" aria-hidden />AI analysis runs on your configured DGX Spark server, never a public cloud model.</li>
          <li className="flex gap-2"><Lock className="h-4 w-4 shrink-0 text-fg-subtle" aria-hidden />OAuth tokens are encrypted at rest and never reach your browser or the AI model.</li>
          <li className="flex gap-2"><Mail className="h-4 w-4 shrink-0 text-fg-subtle" aria-hidden />You can disconnect at any time and optionally delete all synced data.</li>
        </ul>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button onClick={() => connect.mutate(undefined)} loading={connect.isPending} leftIcon={<Mail className="h-4 w-4" aria-hidden />}>
            {connected.length ? 'Connect another account' : 'Connect Gmail (read-only)'}
          </Button>
          <Button variant="ghost" onClick={() => navigate('/dashboard')}>Skip for now</Button>
        </div>
      </Card>
    </div>
  )
}
