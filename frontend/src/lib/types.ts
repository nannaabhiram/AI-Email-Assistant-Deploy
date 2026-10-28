/** API types mirroring backend/app/api/schemas.py. */

export type Priority = 'HIGH' | 'MEDIUM' | 'LOW'
export type RiskLevel = 'none' | 'low' | 'medium' | 'high'
export type DateKind = 'explicit' | 'inferred' | 'none'
export type Tone = 'professional' | 'friendly' | 'formal' | 'concise' | 'custom'
export type ApprovalState =
  | 'PROPOSED'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'EXECUTING'
  | 'SUCCEEDED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'FAILED'
  | 'CANCELLED'
export type ActionType = 'send_reply' | 'archive' | 'apply_label' | 'remove_label' | 'mark_read' | 'mark_unread'
export type TaskStatus = 'suggested' | 'open' | 'done' | 'dismissed'
export type CommitmentStatus = 'suggested' | 'open' | 'fulfilled' | 'cancelled'

export interface Page<T> {
  items: T[]
  total: number
  limit: number
  offset: number
}

export interface ApiErrorBody {
  error: { code: string; message: string; details: Record<string, unknown>; request_id: string | null }
}

export interface SyncState {
  status: 'idle' | 'running' | 'failed'
  history_id: string | null
  last_full_sync_at: string | null
  last_successful_sync_at: string | null
  last_attempt_at: string | null
  last_error: string | null
  messages_synced: number
}

export interface ConnectedAccount {
  id: string
  provider: string
  email_address: string
  status: 'active' | 'needs_reauth' | 'disconnected' | 'error'
  granted_scopes: string[]
  last_error: string | null
  created_at: string
  can_send: boolean
  can_modify: boolean
  sync: SyncState | null
}

export interface RiskFlag {
  code: string
  detail: string
  source?: string
}

export interface Analysis {
  source: 'llm' | 'rules' | 'hybrid'
  model: string | null
  priority: Priority
  effective_priority: Priority
  user_override_priority: Priority | null
  priority_score: number
  rule_score: number | null
  components: Record<string, number | string[]>
  summary: string
  explanation: string
  confidence: string | number
  needs_review: boolean
  reply_needed: boolean
  action_required: boolean
  suggested_action: string | null
  deadline_at: string | null
  deadline_timezone: string | null
  deadline_text: string | null
  deadline_type: DateKind
  entities: {
    people?: string[]
    organizations?: string[]
    amounts?: { value: string; currency: string | null; context: string }[]
    dates?: { text: string; iso: string | null }[]
  }
  category: string | null
  is_newsletter: boolean
  is_notification: boolean
  duplicate_of: string | null
  escalation_reason: string | null
  risk_level: RiskLevel
  risk_flags: RiskFlag[]
  analyzed_at: string
}

export interface EmailListItem {
  id: string
  thread_id: string
  account_id: string
  subject: string | null
  snippet: string | null
  from_address: string | null
  from_name: string | null
  internal_date: string
  is_unread: boolean
  has_attachments: boolean
  label_ids: string[]
  analysis_status: 'pending' | 'queued' | 'done' | 'failed' | 'unavailable'
  priority: Priority | null
  priority_score: number | null
  summary: string | null
  confidence: string | number | null
  needs_review: boolean | null
  reply_needed: boolean | null
  action_required: boolean | null
  deadline_at: string | null
  risk_level: RiskLevel | null
  category: string | null
  analysis_source: 'llm' | 'rules' | 'hybrid' | null
  is_vip: boolean
}

export interface Attachment {
  id: string
  message_id: string
  filename: string
  mime_type: string
  size_bytes: number
  extraction_status: 'not_requested' | 'pending' | 'done' | 'failed' | 'unsupported' | 'too_large' | 'blocked'
  extraction_error: string | null
  extraction: {
    source?: string
    model?: string
    llm_error?: string
    meta?: Record<string, unknown>
    deterministic?: {
      amounts?: { value: string; currency: string | null; context: string }[]
      invoice_numbers?: string[]
      quotation_refs?: string[]
      deadlines?: { description: string; iso: string | null; evidence: string }[]
      prompt_injection_suspected?: boolean
    }
    llm?: {
      summary: string
      document_type: string
      amounts: { value: string; currency: string | null; context: string }[]
      invoice_numbers: string[]
      quotation_values: { value: string; currency: string | null; context: string }[]
      deadlines: { description: string; iso: string | null; evidence: string }[]
      deliverables: string[]
      inconsistencies: string[]
    }
  }
  risk_flags: RiskFlag[]
  stored: boolean
  created_at: string
}

export interface Meeting {
  id: string
  message_id: string
  title: string | null
  start_at: string | null
  end_at: string | null
  timezone: string | null
  location: string | null
  conference_url: string | null
  participants: string[]
  agenda: string | null
  requested_response: string | null
  source: string
  status: string
}

export interface Task {
  id: string
  source_message_id: string | null
  source_thread_id: string | null
  title: string
  description: string | null
  kind: 'task' | 'reply_requested'
  due_at: string | null
  due_date_type: DateKind
  due_timezone: string | null
  evidence: string | null
  status: TaskStatus
  needs_confirmation: boolean
  confidence: string | number | null
  reminder_at: string | null
  completed_at: string | null
  created_by: 'ai' | 'rules' | 'user'
  version: number
  created_at: string
}

export interface Commitment {
  id: string
  source_message_id: string | null
  direction: 'by_me' | 'to_me'
  counterparty: string | null
  description: string
  due_at: string | null
  due_date_type: DateKind
  evidence: string | null
  status: CommitmentStatus
  needs_confirmation: boolean
  confidence: string | number | null
  created_by: 'ai' | 'rules' | 'user'
  version: number
  created_at: string
}

export interface Address {
  email: string
  name?: string
}

export interface EmailDetail {
  id: string
  thread_id: string
  account_id: string
  gmail_message_id: string
  subject: string | null
  from_address: string | null
  from_name: string | null
  reply_to: string | null
  to_addresses: Address[]
  cc_addresses: Address[]
  internal_date: string
  is_unread: boolean
  is_sent: boolean
  label_ids: string[]
  body_text: string | null
  has_html: boolean
  links: { url: string; text?: string }[]
  analysis_status: EmailListItem['analysis_status']
  analysis: Analysis | null
  attachments: Attachment[]
  meetings: Meeting[]
  tasks: Task[]
  commitments: Commitment[]
}

export interface ThreadSummary {
  source: 'llm' | 'rules' | 'hybrid'
  model: string | null
  overview: string
  key_points: string[]
  decisions: string[]
  open_questions: string[]
  tasks: { title: string; owner: string | null; due: string | null }[]
  people: { name: string; email: string | null; role: string | null }[]
  facts: string[]
  inferences: string[]
  next_action: string | null
  message_count_at_summary: number
  updated_at: string
}

export interface Thread {
  id: string
  subject: string | null
  message_count: number
  participants: string[]
  last_message_at: string | null
  messages: EmailDetail[]
  summary: ThreadSummary | null
  summary_stale: boolean
}

export interface DraftVersion {
  id: string
  version_no: number
  subject: string
  body: string
  tone: string
  source: 'ai' | 'user'
  model: string | null
  created_at: string
}

export interface Execution {
  state: 'executing' | 'succeeded' | 'failed'
  attempt_count: number
  gmail_message_id: string | null
  result: Record<string, unknown>
  error: string | null
  started_at: string
  finished_at: string | null
}

export interface Approval {
  id: string
  account_id: string
  action_type: ActionType
  source_message_id: string | null
  source_thread_id: string | null
  draft_id: string | null
  params: Record<string, unknown> & {
    to?: string[]
    cc?: string[]
    subject?: string
    body?: string
    account_email?: string
    gmail_message_ids?: string[]
    label_name?: string | null
  }
  params_hash: string
  explanation: string
  proposed_by: 'user' | 'ai' | 'rules'
  state: ApprovalState
  expires_at: string
  approved_at: string | null
  decided_at: string | null
  decision_reason: string | null
  created_at: string
  execution: Execution | null
}

export interface Draft {
  id: string
  account_id: string
  thread_id: string | null
  reply_to_message_id: string | null
  to_addresses: string[]
  cc_addresses: string[]
  subject: string
  body: string
  tone: Tone | string
  custom_tone: string | null
  status: 'draft' | 'pending_approval' | 'approved' | 'sent' | 'discarded'
  source: 'ai' | 'user'
  model: string | null
  current_version_no: number
  version: number
  created_at: string
  updated_at: string
  notes_for_user: string | null
  placeholders: string[]
}

export interface DraftDetail extends Draft {
  versions: DraftVersion[]
  approvals: Approval[]
}

export interface BriefingItem {
  id: string
  subject?: string | null
  title?: string
  from_name?: string | null
  from_address?: string | null
  summary?: string
  due_at?: string | null
  internal_date?: string
  priority?: Priority
  priority_score?: number
  risk_level?: RiskLevel
  suggested_action?: string | null
  description?: string
  direction?: string
  counterparty?: string | null
  start_at?: string | null
  location?: string | null
  conference_url?: string | null
  message_id?: string
  source_message_id?: string | null
}

export interface BriefingContent {
  generated_at: string
  timezone: string
  since: string
  top_emails: BriefingItem[]
  due_today: BriefingItem[]
  upcoming: BriefingItem[]
  overdue_tasks: BriefingItem[]
  overdue_commitments: BriefingItem[]
  awaiting_reply: BriefingItem[]
  meetings: BriefingItem[]
  changes: { new_messages: number; new_high: number; new_risky: number; tasks_completed: number }
  pending_approvals: number
  recommended_actions: string[]
  llm_recommended_actions?: string[]
}

export interface Briefing {
  id: string
  briefing_date: string
  status: string
  source: 'llm' | 'rules' | 'hybrid'
  content: BriefingContent
  narrative: string | null
  created_at: string
}

export interface Contact {
  id: string
  email: string
  display_name: string | null
  domain: string | null
  is_vip: boolean
  importance: number
  notes: string | null
  relationship_summary: string | null
  relationship_summary_at: string | null
  inbound_count: number
  outbound_count: number
  last_inbound_at: string | null
  last_outbound_at: string | null
}

export interface ContactPreferences {
  priority_floor: Priority | null
  priority_ceiling: Priority | null
  muted: boolean
  digest: boolean
  preferred_tone: string | null
}

export interface ContactDetail extends Contact {
  preferences: ContactPreferences | null
  recent_messages: EmailListItem[]
  open_commitments: Commitment[]
}

export interface Settings {
  timezone: string
  briefing_enabled: boolean
  briefing_time: string
  notification_prefs: Record<string, boolean>
  priority_thresholds: { high: number; medium: number }
  scoring_weights: { deadline: number; action: number; impact: number; sender: number; context: number }
  review_confidence_threshold: string | number
  auto_analyze: boolean
  attachment_auto_extract: boolean
  attachment_max_bytes: number
  store_attachments: boolean
  email_retention_days: number
  sync_lookback_days: number
  sync_max_messages: number
  default_reply_tone: string
  newsletter_digest: boolean
  version: number
}

export interface Profile {
  id: string
  email: string | null
  display_name: string | null
  accounts: ConnectedAccount[]
  settings: Settings | null
}

export interface JobRef {
  job_id: number | null
  status: string
  detail?: string | null
}

export interface Job {
  id: number
  job_type: string
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'dead'
  attempts: number
  max_attempts: number
  run_at: string
  last_error: string | null
  created_at: string
  finished_at: string | null
}

export interface SystemStatus {
  accounts: {
    id: string
    email: string
    status: string
    sync_status: string | null
    last_successful_sync_at: string | null
    last_error: string | null
  }[]
  jobs: Record<string, number>
  recent_job_failures: { job_type: string; error: string; at: string }[]
  llm: {
    configured: boolean
    reachable: boolean
    model: string | null
    model_available: boolean
    latency_ms: number | null
    error: string | null
    last_24h: Record<string, { count: number; avg_latency_ms: number }>
  }
}

export interface SearchResponse {
  target: 'emails' | 'tasks' | 'commitments'
  parser: string
  filters: Record<string, unknown>
  results: Record<string, unknown>[]
}

export interface Analytics {
  range_days: number
  volume: { day: string; received: number; sent: number }[]
  priority_distribution: Partial<Record<Priority, number>>
  analysis_sources: Record<string, number>
  overrides: { model_priority: string; user_priority: string | null; n: number }[]
  high_priority_agreement: { high_classified: number; overridden_down: number; agreement_rate: number | null; note: string }
  response_backlog: number
  median_response_seconds: number | null
  response_sample_size: number
  tasks: { overdue: number; open: number; done: number; suggested: number }
  newsletter_volume: number
  llm: { task: string; status: string; n: number; avg_ms: number | null; p95_ms: number | null }[]
}

export interface NotificationItem {
  id: string
  kind: string
  title: string
  body: string | null
  link: string | null
  read_at: string | null
  created_at: string
}

export interface AuditEntry {
  id: number
  actor: string
  event: string
  entity_type: string | null
  entity_id: string | null
  details: Record<string, unknown>
  request_id: string | null
  created_at: string
}

export interface OrganizeSuggestion {
  action_type: Exclude<ActionType, 'send_reply'>
  message_ids: string[]
  title: string
  reason: string
  label_name: string | null
}

export interface NewsletterDigest {
  senders: {
    from_address: string
    from_name: string | null
    count: number
    latest_at: string
    unread: number
    message_ids: string[]
    recent_subjects: string[]
  }[]
  duplicates: { message_id: string; duplicate_of: string; subject: string | null; from_address: string | null }[]
  note: string
}

export interface LlmDiagnostics {
  configured: boolean
  reachable: boolean
  latency_ms: number | null
  configured_model: string | null
  model_available: boolean
  available_models: string[]
  error: string | null
  endpoint_host: string | null
  via_ssh_tunnel: boolean
  structured_output_mode: string
  max_concurrency: number
  timeout_seconds: number
  fallback_mode: string
  embeddings_configured: boolean
}
