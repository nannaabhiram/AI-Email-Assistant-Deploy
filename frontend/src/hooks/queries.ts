/** TanStack Query hooks: one place for cache keys, polling and invalidation rules. */
import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api, errorMessage, type EmailFilters } from '@/lib/api'
import type { ApprovalState, Job } from '@/lib/types'
import { useToast } from '@/components/ui/Toast'

export const keys = {
  me: ['me'] as const,
  status: ['system-status'] as const,
  llm: ['llm-diagnostics'] as const,
  accounts: ['accounts'] as const,
  emails: (f: EmailFilters) => ['emails', f] as const,
  email: (id: string) => ['email', id] as const,
  thread: (id: string) => ['thread', id] as const,
  tasks: (p: object) => ['tasks', p] as const,
  commitments: (p: object) => ['commitments', p] as const,
  drafts: ['drafts'] as const,
  draft: (id: string) => ['draft', id] as const,
  approvals: (s?: ApprovalState[]) => ['approvals', s ?? 'all'] as const,
  briefings: ['briefings'] as const,
  latestBriefing: ['briefing-latest'] as const,
  attachments: (s?: string) => ['attachments', s ?? 'all'] as const,
  contacts: (p: object) => ['contacts', p] as const,
  contact: (id: string) => ['contact', id] as const,
  analytics: (d: number) => ['analytics', d] as const,
  settings: ['settings'] as const,
  notifications: ['notifications'] as const,
  audit: (o: number) => ['audit', o] as const,
  jobs: ['jobs'] as const,
  meetings: ['meetings'] as const,
  newsletters: ['newsletters'] as const,
  organize: ['organize'] as const,
}

export const useMe = () => useQuery({ queryKey: keys.me, queryFn: api.me, staleTime: 30_000 })
export const useSystemStatus = () => useQuery({ queryKey: keys.status, queryFn: api.systemStatus, refetchInterval: 30_000 })
export const useLlmDiagnostics = () => useQuery({ queryKey: keys.llm, queryFn: api.llmDiagnostics, staleTime: 15_000 })
export const useAccounts = () => useQuery({ queryKey: keys.accounts, queryFn: api.accounts, refetchInterval: 15_000 })
export const useEmails = (f: EmailFilters) =>
  useQuery({ queryKey: keys.emails(f), queryFn: () => api.emails(f), placeholderData: keepPreviousData, refetchInterval: 60_000 })
export const useEmail = (id: string | undefined) =>
  useQuery({
    queryKey: keys.email(id ?? ''), queryFn: () => api.email(id!), enabled: Boolean(id),
    refetchInterval: (q) => (q.state.data && ['pending', 'queued'].includes(q.state.data.analysis_status) ? 5000 : false),
  })
export const useThread = (id: string | undefined) => useQuery({ queryKey: keys.thread(id ?? ''), queryFn: () => api.thread(id!), enabled: Boolean(id) })
export const useTasks = (p: Parameters<typeof api.tasks>[0]) => useQuery({ queryKey: keys.tasks(p ?? {}), queryFn: () => api.tasks(p) })
export const useCommitments = (p: Parameters<typeof api.commitments>[0]) => useQuery({ queryKey: keys.commitments(p ?? {}), queryFn: () => api.commitments(p) })
export const useDrafts = () => useQuery({ queryKey: keys.drafts, queryFn: () => api.drafts() })
export const useDraft = (id: string | undefined) => useQuery({ queryKey: keys.draft(id ?? ''), queryFn: () => api.draft(id!), enabled: Boolean(id) })
export const useApprovals = (state?: ApprovalState[]) =>
  useQuery({
    queryKey: keys.approvals(state), queryFn: () => api.approvals(state),
    refetchInterval: (q) => (q.state.data?.items.some((a) => a.state === 'APPROVED' || a.state === 'EXECUTING') ? 3000 : 30_000),
  })
export const useLatestBriefing = () => useQuery({ queryKey: keys.latestBriefing, queryFn: api.latestBriefing })
export const useBriefings = () => useQuery({ queryKey: keys.briefings, queryFn: api.briefings })
export const useAttachments = (s?: string) =>
  useQuery({
    queryKey: keys.attachments(s), queryFn: () => api.attachments(s),
    refetchInterval: (q) => (q.state.data?.items.some((a) => a.extraction_status === 'pending') ? 4000 : false),
  })
export const useContacts = (p: Parameters<typeof api.contacts>[0]) =>
  useQuery({ queryKey: keys.contacts(p ?? {}), queryFn: () => api.contacts(p), placeholderData: keepPreviousData })
export const useContact = (id: string | undefined) => useQuery({ queryKey: keys.contact(id ?? ''), queryFn: () => api.contact(id!), enabled: Boolean(id) })
export const useAnalytics = (days: number) => useQuery({ queryKey: keys.analytics(days), queryFn: () => api.analytics(days) })
export const useSettings = () => useQuery({ queryKey: keys.settings, queryFn: api.settings })
export const useNotifications = () => useQuery({ queryKey: keys.notifications, queryFn: () => api.notifications(), refetchInterval: 60_000 })
export const useAudit = (offset: number) => useQuery({ queryKey: keys.audit(offset), queryFn: () => api.audit(offset), placeholderData: keepPreviousData })
export const useJobs = () => useQuery({ queryKey: keys.jobs, queryFn: () => api.jobs(), refetchInterval: 15_000 })
export const useMeetings = () => useQuery({ queryKey: keys.meetings, queryFn: api.meetings })
export const useNewsletters = () => useQuery({ queryKey: keys.newsletters, queryFn: () => api.newsletters() })
export const useOrganize = () => useQuery({ queryKey: keys.organize, queryFn: api.organizeSuggestions })

/** Mutation with toast feedback and invalidation of related queries. */
export function useAction<TArgs, TResult>(
  fn: (args: TArgs) => Promise<TResult>,
  opts: { success?: string | ((r: TResult) => string); invalidate?: QueryKey[]; onSuccess?: (r: TResult, args: TArgs) => void; errorTitle?: string } = {},
) {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: fn,
    onSuccess: async (result, args) => {
      await Promise.all((opts.invalidate ?? []).map((k) => qc.invalidateQueries({ queryKey: k })))
      if (opts.success) toast.success(typeof opts.success === 'function' ? opts.success(result) : opts.success)
      opts.onSuccess?.(result, args)
    },
    onError: (err) => toast.error(opts.errorTitle ?? 'Action failed', errorMessage(err)),
  })
}

/** Polls a background job until it finishes; invalidates the given queries when it does. */
export function useJobWatcher(invalidate: QueryKey[]) {
  const qc = useQueryClient()
  const toast = useToast()
  const [jobId, setJobId] = useState<number | null>(null)
  const job = useQuery({
    queryKey: ['job', jobId], queryFn: () => api.job(jobId!), enabled: jobId !== null,
    refetchInterval: (q) => (q.state.data && ['succeeded', 'failed', 'dead'].includes(q.state.data.status) ? false : 1500),
  })
  const status: Job['status'] | undefined = job.data?.status
  useEffect(() => {
    if (!status || jobId === null) return
    if (status === 'succeeded') {
      invalidate.forEach((k) => void qc.invalidateQueries({ queryKey: k }))
      setJobId(null)
    } else if (status === 'failed' || status === 'dead') {
      toast.error('Background task failed', job.data?.last_error ?? undefined)
      setJobId(null)
    } else if (status === 'queued' && job.data?.last_error) {
      // Deferred (e.g. DGX offline): rule-based results are already available.
      invalidate.forEach((k) => void qc.invalidateQueries({ queryKey: k }))
    }
  }, [status, jobId]) // eslint-disable-line react-hooks/exhaustive-deps
  return { watch: (id: number | null) => setJobId(id), running: jobId !== null, job: job.data }
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}
