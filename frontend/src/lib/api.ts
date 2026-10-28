/**
 * Typed API client. The browser only ever holds the user's Supabase session token;
 * every request is authorised server-side from that verified token.
 */
import type {
  Analysis,
  Analytics,
  Approval,
  ApprovalState,
  AuditEntry,
  Attachment,
  Briefing,
  Commitment,
  ConnectedAccount,
  Contact,
  ContactDetail,
  ContactPreferences,
  Draft,
  DraftDetail,
  EmailDetail,
  EmailListItem,
  Job,
  JobRef,
  LlmDiagnostics,
  Meeting,
  NewsletterDigest,
  NotificationItem,
  OrganizeSuggestion,
  Page,
  Priority,
  Profile,
  SearchResponse,
  Settings,
  SyncState,
  SystemStatus,
  Task,
  Thread,
  Tone,
} from './types'

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: Record<string, unknown>
  readonly requestId: string | null

  constructor(status: number, code: string, message: string, details: Record<string, unknown> = {}, requestId: string | null = null) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
    this.requestId = requestId
  }
}

type TokenGetter = () => Promise<string | null>
let tokenGetter: TokenGetter = async () => null
let onUnauthorized: () => void = () => undefined

export function configureApi(getter: TokenGetter, unauthorized: () => void): void {
  tokenGetter = getter
  onUnauthorized = unauthorized
}

const baseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? 'http://localhost:8000'

type Query = Record<string, string | number | boolean | string[] | null | undefined>

function toQuery(params?: Query): string {
  if (!params) return ''
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value)) value.forEach((v) => qs.append(key, v))
    else qs.set(key, String(value))
  }
  const s = qs.toString()
  return s ? `?${s}` : ''
}

export async function request<T>(method: string, path: string, body?: unknown, params?: Query, signal?: AbortSignal): Promise<T> {
  const token = await tokenGetter()
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  let response: Response
  try {
    response = await fetch(`${baseUrl}${path}${toQuery(params)}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    throw new ApiError(0, 'network_error', 'Cannot reach the MailPilot server. Check your connection or that the backend is running.')
  }
  if (response.status === 204) return undefined as T
  const text = await response.text()
  const data: unknown = text ? JSON.parse(text) : null
  if (!response.ok) {
    const err = (data as { error?: { code?: string; message?: string; details?: Record<string, unknown>; request_id?: string } } | null)?.error
    if (response.status === 401) onUnauthorized()
    throw new ApiError(response.status, err?.code ?? 'http_error', err?.message ?? `Request failed (${response.status})`, err?.details ?? {}, err?.request_id ?? null)
  }
  return data as T
}

export interface EmailFilters {
  limit?: number
  offset?: number
  priority?: Priority[]
  unread?: boolean
  action_required?: boolean
  reply_needed?: boolean
  needs_review?: boolean
  risky?: boolean
  newsletter?: boolean
  category?: string
  q?: string
  sort?: 'priority' | 'newest' | 'oldest' | 'deadline'
}

export const api = {
  me: () => request<Profile>('GET', '/api/v1/me'),
  updateMe: (display_name: string) => request<Profile>('PATCH', '/api/v1/me', { display_name }),
  deleteMe: () => request<void>('DELETE', '/api/v1/me', { confirm: 'DELETE' }),
  systemStatus: () => request<SystemStatus>('GET', '/api/v1/system/status'),
  llmDiagnostics: () => request<LlmDiagnostics>('GET', '/api/v1/diagnostics/llm'),

  accounts: () => request<ConnectedAccount[]>('GET', '/api/v1/accounts'),
  startOAuth: (scope_set: 'readonly' | 'send' | 'modify' | 'full', redirect_path = '/settings/accounts') =>
    request<{ authorization_url: string }>('POST', '/api/v1/gmail/oauth/start', { scope_set, redirect_path }),
  sync: (accountId: string, mode: 'auto' | 'full' = 'auto') => request<JobRef>('POST', `/api/v1/accounts/${accountId}/sync`, { mode }),
  syncStatus: (accountId: string) => request<SyncState>('GET', `/api/v1/accounts/${accountId}/sync-status`),
  disconnect: (accountId: string, delete_data: boolean) => request<void>('POST', `/api/v1/accounts/${accountId}/disconnect`, { delete_data }),
  labels: (accountId: string) => request<{ id: string; name: string; type: string }[]>('GET', `/api/v1/accounts/${accountId}/labels`),

  emails: (filters: EmailFilters) => request<Page<EmailListItem>>('GET', '/api/v1/emails', undefined, filters as Query),
  email: (id: string) => request<EmailDetail>('GET', `/api/v1/emails/${id}`),
  reanalyze: (id: string) => request<JobRef>('POST', `/api/v1/emails/${id}/analyze`),
  overridePriority: (id: string, priority: Priority | null, comment?: string) =>
    request<Analysis>('POST', `/api/v1/emails/${id}/priority`, { priority, comment }),
  thread: (id: string) => request<Thread>('GET', `/api/v1/threads/${id}`),
  summarizeThread: (id: string) => request<JobRef>('POST', `/api/v1/threads/${id}/summarize`),
  newsletters: (days = 14) => request<NewsletterDigest>('GET', '/api/v1/newsletters', undefined, { days }),
  meetings: () => request<Meeting[]>('GET', '/api/v1/meetings'),
  dismissMeeting: (id: string) => request<Meeting>('POST', `/api/v1/meetings/${id}/dismiss`),

  tasks: (params: { status?: string[]; due?: string; limit?: number; offset?: number } = {}) =>
    request<Page<Task>>('GET', '/api/v1/tasks', undefined, params as Query),
  createTask: (body: { title: string; description?: string | null; due_at?: string | null; source_message_id?: string | null }) =>
    request<Task>('POST', '/api/v1/tasks', body),
  updateTask: (id: string, body: Partial<Pick<Task, 'title' | 'description' | 'status' | 'due_at'>> & { version: number; clear_due?: boolean }) =>
    request<Task>('PATCH', `/api/v1/tasks/${id}`, body),
  deleteTask: (id: string) => request<void>('DELETE', `/api/v1/tasks/${id}`),
  commitments: (params: { status?: string[]; direction?: string } = {}) =>
    request<Page<Commitment>>('GET', '/api/v1/commitments', undefined, params as Query),
  createCommitment: (body: { direction: 'by_me' | 'to_me'; description: string; counterparty?: string | null; due_at?: string | null }) =>
    request<Commitment>('POST', '/api/v1/commitments', body),
  updateCommitment: (id: string, body: Partial<Pick<Commitment, 'description' | 'counterparty' | 'status' | 'due_at'>> & { version: number; clear_due?: boolean }) =>
    request<Commitment>('PATCH', `/api/v1/commitments/${id}`, body),
  deleteCommitment: (id: string) => request<void>('DELETE', `/api/v1/commitments/${id}`),

  drafts: (status?: string[]) => request<Page<Draft>>('GET', '/api/v1/drafts', undefined, { status }),
  draft: (id: string) => request<DraftDetail>('GET', `/api/v1/drafts/${id}`),
  createDraft: (body: { message_id: string; tone: Tone; custom_tone?: string | null; instructions?: string | null; use_ai: boolean }) =>
    request<Draft>('POST', '/api/v1/drafts', body),
  updateDraft: (id: string, body: { version: number; to?: string[]; cc?: string[]; subject?: string; body?: string; tone?: Tone }) =>
    request<Draft>('PATCH', `/api/v1/drafts/${id}`, body),
  regenerateDraft: (id: string, body: { tone: Tone; custom_tone?: string | null; instructions?: string | null }) =>
    request<Draft>('POST', `/api/v1/drafts/${id}/regenerate`, body),
  discardDraft: (id: string) => request<void>('DELETE', `/api/v1/drafts/${id}`),
  requestApproval: (id: string, acknowledge_external_recipients = false) =>
    request<Approval>('POST', `/api/v1/drafts/${id}/request-approval`, { acknowledge_external_recipients }),

  approvals: (state?: ApprovalState[]) => request<Page<Approval>>('GET', '/api/v1/approvals', undefined, { state }),
  approval: (id: string) => request<Approval>('GET', `/api/v1/approvals/${id}`),
  approve: (id: string, params_hash: string) => request<Approval>('POST', `/api/v1/approvals/${id}/approve`, { params_hash }),
  reject: (id: string, reason?: string) => request<Approval>('POST', `/api/v1/approvals/${id}/reject`, { reason }),
  cancelApproval: (id: string, reason?: string) => request<Approval>('POST', `/api/v1/approvals/${id}/cancel`, { reason }),
  retryApproval: (id: string) => request<Approval>('POST', `/api/v1/approvals/${id}/retry`),
  proposeAction: (body: { action_type: OrganizeSuggestion['action_type']; message_ids: string[]; label_name?: string | null }) =>
    request<Approval>('POST', '/api/v1/actions/propose', body),
  organizeSuggestions: () => request<{ suggestions: OrganizeSuggestion[]; note: string }>('GET', '/api/v1/organize/suggestions'),

  search: (query: string, limit = 20) => request<SearchResponse>('POST', '/api/v1/search', { query, limit }),
  briefings: () => request<Page<Briefing>>('GET', '/api/v1/briefings'),
  latestBriefing: () => request<Briefing | null>('GET', '/api/v1/briefings/latest'),
  generateBriefing: () => request<JobRef>('POST', '/api/v1/briefings/generate'),

  attachments: (status?: string) => request<Page<Attachment>>('GET', '/api/v1/attachments', undefined, { status }),
  attachment: (id: string) => request<Attachment & { extracted_text_preview: string }>('GET', `/api/v1/attachments/${id}`),
  extractAttachment: (id: string) => request<JobRef>('POST', `/api/v1/attachments/${id}/extract`),
  attachmentUrl: (id: string) => request<{ url: string; expires_in: number }>('GET', `/api/v1/attachments/${id}/download-url`),

  contacts: (params: { vip?: boolean; q?: string; sort?: string; limit?: number; offset?: number } = {}) =>
    request<Page<Contact>>('GET', '/api/v1/contacts', undefined, params as Query),
  contact: (id: string) => request<ContactDetail>('GET', `/api/v1/contacts/${id}`),
  createContact: (body: { email: string; display_name?: string | null; is_vip: boolean; importance: number }) =>
    request<Contact>('POST', '/api/v1/contacts', body),
  updateContact: (id: string, body: Partial<Pick<Contact, 'display_name' | 'is_vip' | 'importance' | 'notes'>>) =>
    request<Contact>('PATCH', `/api/v1/contacts/${id}`, body),
  setContactPreferences: (id: string, body: ContactPreferences) => request<ContactPreferences>('PUT', `/api/v1/contacts/${id}/preferences`, body),
  summarizeContact: (id: string) => request<Contact>('POST', `/api/v1/contacts/${id}/summarize`),
  clearContactMemory: (id: string) => request<Contact>('DELETE', `/api/v1/contacts/${id}/memory`),

  analytics: (days = 30) => request<Analytics>('GET', '/api/v1/analytics', undefined, { days }),
  settings: () => request<Settings>('GET', '/api/v1/settings'),
  updateSettings: (body: Partial<Omit<Settings, 'version'>> & { version: number }) => request<Settings>('PATCH', '/api/v1/settings', body),
  deleteEmailData: () => request<void>('DELETE', '/api/v1/data/emails'),
  notifications: (unread_only = false) => request<Page<NotificationItem>>('GET', '/api/v1/notifications', undefined, { unread_only }),
  readNotification: (id: string) => request<void>('POST', `/api/v1/notifications/${id}/read`),
  readAllNotifications: () => request<void>('POST', '/api/v1/notifications/read-all'),
  jobs: (failed_only = false) => request<Job[]>('GET', '/api/v1/jobs', undefined, { failed_only }),
  job: (id: number) => request<Job>('GET', `/api/v1/jobs/${id}`),
  audit: (offset = 0) => request<Page<AuditEntry>>('GET', '/api/v1/audit', undefined, { offset, limit: 50 }),
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message
  if (err instanceof Error) return err.message
  return 'Something went wrong'
}
