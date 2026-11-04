import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import { useToast } from '@/components/ui/Toast'
import { api } from '@/lib/api'

const POLL_MS = 20_000

/** Pops a toast (and a system notification when the tab is in the background) when new mail syncs in. */
export function NewMailWatcher() {
  const toast = useToast()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const newest = useQuery({
    queryKey: ['emails', 'newest-watch'],
    queryFn: () => api.emails({ sort: 'newest', limit: 5 }),
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: true,
  })
  const seen = useRef<number | null>(null)

  useEffect(() => {
    const items = newest.data?.items
    if (!items) return
    const latest = Math.max(0, ...items.map((m) => new Date(m.internal_date).getTime()))
    if (seen.current === null) {
      seen.current = latest
      return
    }
    const fresh = items.filter((m) => new Date(m.internal_date).getTime() > (seen.current ?? 0))
    if (!fresh.length) return
    seen.current = latest
    void queryClient.invalidateQueries({ queryKey: ['emails'] })
    const first = fresh[0]
    if (!first) return
    const sender = first.from_name || first.from_address || 'Someone'
    const title = fresh.length === 1 ? `New message from ${sender}` : `${fresh.length} new messages`
    const description = fresh.length === 1 ? first.subject || '(no subject)' : fresh.map((m) => m.from_name || m.from_address).slice(0, 3).join(', ')
    const open = () => navigate(fresh.length === 1 ? `/inbox/${first.id}` : '/inbox')
    toast.show({ tone: 'info', title, description, durationMs: 10_000, action: { label: 'Open', onClick: open } })
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) {
      const n = new Notification(title, { body: description, tag: `mailpilot-${first.id}` })
      n.onclick = () => { window.focus(); open(); n.close() }
    }
  }, [newest.data, navigate, queryClient, toast])

  useEffect(() => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'default') return
    const ask = () => { void Notification.requestPermission() }
    window.addEventListener('pointerdown', ask, { once: true })
    return () => window.removeEventListener('pointerdown', ask)
  }, [])

  return null
}
