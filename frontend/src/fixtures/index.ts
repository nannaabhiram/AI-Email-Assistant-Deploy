/**
 * Synthetic fixtures for Storybook and tests. All people, companies, addresses and
 * messages are fictional (example.* domains); never replace them with real mail.
 */
import type {
  Analysis, Approval, Attachment, Briefing, Contact, Draft, DraftVersion, EmailDetail, EmailListItem, Task, ThreadSummary,
} from '@/lib/types'

export const NOW = new Date('2026-10-28T09:00:00Z')
const iso = (hoursFromNow: number) => new Date(NOW.getTime() + hoursFromNow * 3600_000).toISOString()

export const emailItems: EmailListItem[] = [
  {
    id: 'e1', thread_id: 't1', account_id: 'a1', subject: 'Q4 vendor contract renewal – signature needed by Friday',
    snippet: 'Please review the attached renewal and sign by Friday 5 PM.', from_address: 'priya.nair@northwind.example',
    from_name: 'Priya Nair', internal_date: iso(-2), is_unread: true, has_attachments: true, label_ids: ['INBOX', 'UNREAD'],
    analysis_status: 'done', priority: 'HIGH', priority_score: 82,
    summary: 'Northwind asks you to sign the Q4 renewal (INR 12,50,000/yr) by Friday 5 PM IST and confirm the SLA change.',
    confidence: 0.86, needs_review: false, reply_needed: true, action_required: true, deadline_at: iso(54), risk_level: 'none',
    category: 'work', analysis_source: 'hybrid', is_vip: true,
  },
  {
    id: 'e2', thread_id: 't2', account_id: 'a1', subject: 'URGENT: update payroll bank details today',
    snippet: "Kindly update the bank account for this month's payroll.", from_address: 'ceo.office@contoso-payroll.example',
    from_name: 'CEO Office', internal_date: iso(-3), is_unread: true, has_attachments: false, label_ids: ['INBOX', 'UNREAD'],
    analysis_status: 'done', priority: 'HIGH', priority_score: 64,
    summary: 'Request to change payroll bank details urgently; shows multiple phishing indicators.', confidence: 0.6,
    needs_review: true, reply_needed: false, action_required: true, deadline_at: null, risk_level: 'high', category: 'security',
    analysis_source: 'rules', is_vip: false,
  },
  {
    id: 'e3', thread_id: 't3', account_id: 'a1', subject: 'Design review sync on Thursday?',
    snippet: 'Could we meet Thursday 3 PM IST to review the mockups?', from_address: 'arjun.mehta@fabrikam.example',
    from_name: 'Arjun Mehta', internal_date: iso(-7), is_unread: false, has_attachments: false, label_ids: ['INBOX'],
    analysis_status: 'done', priority: 'MEDIUM', priority_score: 52,
    summary: 'Arjun proposes a design review on Thursday 3 PM IST via Google Meet and asks for confirmation.',
    confidence: 0.75, needs_review: false, reply_needed: true, action_required: true, deadline_at: null, risk_level: 'none',
    category: 'meeting', analysis_source: 'hybrid', is_vip: false,
  },
  {
    id: 'e4', thread_id: 't4', account_id: 'a1', subject: 'Weekly product digest', snippet: 'This week: 5 new features and a webinar.',
    from_address: 'digest@newsletter.example', from_name: 'Product Digest', internal_date: iso(-26), is_unread: false,
    has_attachments: false, label_ids: ['INBOX', 'CATEGORY_PROMOTIONS'], analysis_status: 'done', priority: 'LOW', priority_score: 12,
    summary: 'Weekly product newsletter with feature updates and a webinar invitation.', confidence: 0.9, needs_review: false,
    reply_needed: false, action_required: false, deadline_at: null, risk_level: 'none', category: 'newsletter',
    analysis_source: 'hybrid', is_vip: false,
  },
  {
    id: 'e5', thread_id: 't5', account_id: 'a1', subject: 'Re: Budget figures', snippet: 'Thanks — I will look at it shortly.',
    from_address: 'sam.lee@adatum.example', from_name: 'Sam Lee', internal_date: iso(-0.2), is_unread: true, has_attachments: false,
    label_ids: ['INBOX', 'UNREAD'], analysis_status: 'queued', priority: null, priority_score: null, summary: null, confidence: null,
    needs_review: null, reply_needed: null, action_required: null, deadline_at: null, risk_level: null, category: null,
    analysis_source: null, is_vip: false,
  },
]

export const analysis: Analysis = {
  source: 'hybrid', model: 'example-model-70b', priority: 'HIGH', effective_priority: 'HIGH', user_override_priority: null,
  priority_score: 82, rule_score: 78,
  components: { deadline: 85, action: 90, impact: 75, sender: 90, context: 50, review_reasons: [] },
  summary: emailItems[0]!.summary!,
  explanation: 'Explicit signature deadline this week from a VIP contact, with a direct request to confirm an SLA change.',
  confidence: 0.86, needs_review: false, reply_needed: true, action_required: true,
  suggested_action: 'Review the section 4 SLA change, then sign the renewal.', deadline_at: iso(54),
  deadline_timezone: 'Asia/Kolkata', deadline_text: 'Friday 5 PM IST', deadline_type: 'explicit',
  entities: { amounts: [{ value: '12,50,000', currency: 'INR', context: 'renewal value per year' }], people: ['Priya Nair'] },
  category: 'work', is_newsletter: false, is_notification: false, duplicate_of: null, escalation_reason: null,
  risk_level: 'none', risk_flags: [], analyzed_at: iso(-1.9),
}

export const riskyAnalysis: Analysis = {
  ...analysis, source: 'rules', model: null, priority_score: 64, confidence: 0.6, needs_review: true,
  escalation_reason: 'phishing_risk', risk_level: 'high', category: 'security', reply_needed: false,
  summary: emailItems[1]!.summary!, suggested_action: 'Do not act on this email. Verify through a known phone number.',
  explanation: 'Rule-based assessment (scores 0-100): deadline 80, action 80, impact 70, sender 20, context 30. Escalated to HIGH: phishing risk.',
  risk_flags: [
    { code: 'payment_instruction_change', detail: 'Requests new or changed payment / bank details' },
    { code: 'auth_failure', detail: 'Sender authentication (SPF/DKIM/DMARC) failed' },
    { code: 'suspicious_link', detail: 'Link points to a raw IP address (192.0.2.10)' },
    { code: 'urgency_pressure', detail: 'Uses urgency or secrecy pressure' },
  ],
}

export const attachments: Attachment[] = [
  {
    id: 'att1', message_id: 'e1', filename: 'Northwind_Q4_Renewal.pdf', mime_type: 'application/pdf', size_bytes: 284_311,
    extraction_status: 'done', extraction_error: null, stored: false, created_at: iso(-2), risk_flags: [],
    extraction: {
      source: 'hybrid', model: 'example-model-70b', meta: { pages: 4 },
      deterministic: { amounts: [{ value: '12,50,000', currency: 'INR', context: 'Annual fee INR 12,50,000' }], invoice_numbers: [], quotation_refs: ['NW-2026-Q4'] },
      llm: {
        summary: 'Support contract renewal for Q4 2026 – Q3 2027 with a revised 8-hour response SLA.', document_type: 'contract',
        amounts: [{ value: '12,50,000', currency: 'INR', context: 'annual fee' }], invoice_numbers: [], quotation_values: [],
        deadlines: [{ description: 'Signature due Friday 5 PM IST', iso: iso(54), evidence: 'sign by Friday 5 PM IST' }],
        deliverables: ['24×7 support desk', 'Quarterly service review'], inconsistencies: ['Email says 4-hour SLA; contract section 4 says 8 hours.'],
      },
    },
  },
  {
    id: 'att2', message_id: 'e2', filename: 'invoice.pdf.exe', mime_type: 'application/octet-stream', size_bytes: 91_002,
    extraction_status: 'blocked', extraction_error: 'Executable, script or macro attachments are never processed', stored: false,
    created_at: iso(-3), extraction: {}, risk_flags: [{ code: 'dangerous_attachment', detail: 'Executable or script attachment: invoice.pdf.exe' }],
  },
  {
    id: 'att3', message_id: 'e6', filename: 'laptop_quotation.csv', mime_type: 'text/csv', size_bytes: 1_840, extraction_status: 'not_requested',
    extraction_error: null, stored: false, created_at: iso(-26), extraction: {}, risk_flags: [],
  },
]

export const emailDetail: EmailDetail = {
  id: 'e1', thread_id: 't1', account_id: 'a1', gmail_message_id: 'synthetic-1', subject: emailItems[0]!.subject,
  from_address: 'priya.nair@northwind.example', from_name: 'Priya Nair', reply_to: null,
  to_addresses: [{ email: 'you@example.org', name: 'You' }], cc_addresses: [], internal_date: iso(-2), is_unread: true, is_sent: false,
  label_ids: ['INBOX', 'UNREAD'], has_html: true,
  body_text: 'Hi,\n\nPlease review the attached Q4 renewal for the Northwind support contract and sign it by Friday 5 PM IST. The renewal value is INR 12,50,000 per year.\n\nCould you also confirm whether the SLA change in section 4 is acceptable?\n\nThanks,\nPriya',
  links: [{ url: 'https://portal.northwind.example/contracts/q4', text: 'Contract portal' }],
  analysis_status: 'done', analysis, attachments: [attachments[0]!], meetings: [], tasks: [], commitments: [],
}

export const threadSummary: ThreadSummary = {
  source: 'llm', model: 'example-model-70b', overview: 'Northwind requests signature of the Q4 support renewal and SLA confirmation.',
  key_points: ['Renewal value INR 12,50,000 per year', 'Signature due Friday 5 PM IST', 'SLA response time changes in section 4'],
  decisions: [], open_questions: ['Is the section 4 SLA change acceptable?'],
  tasks: [{ title: 'Sign the renewal', owner: 'You', due: 'Friday 5 PM IST' }],
  people: [{ name: 'Priya Nair', email: 'priya.nair@northwind.example', role: 'Account manager' }],
  facts: ['Renewal value is INR 12,50,000 per year.'], inferences: ['The SLA change may reduce support responsiveness.'],
  next_action: 'Compare the SLA wording with the current contract, then reply.', message_count_at_summary: 1, updated_at: iso(-1),
}

export const tasks: Task[] = [
  {
    id: 'k1', source_message_id: 'e1', source_thread_id: 't1', title: 'Sign Northwind Q4 contract renewal', description: null,
    kind: 'task', due_at: iso(54), due_date_type: 'explicit', due_timezone: 'Asia/Kolkata', evidence: 'sign it by Friday 5 PM IST',
    status: 'open', needs_confirmation: false, confidence: 0.88, reminder_at: iso(30), completed_at: null, created_by: 'ai', version: 1, created_at: iso(-2),
  },
  {
    id: 'k2', source_message_id: 'e1', source_thread_id: 't1', title: 'Confirm SLA change in section 4', description: null,
    kind: 'reply_requested', due_at: null, due_date_type: 'none', due_timezone: null,
    evidence: 'Could you also confirm whether the SLA change in section 4 is acceptable?', status: 'suggested', needs_confirmation: true,
    confidence: 0.62, reminder_at: null, completed_at: null, created_by: 'ai', version: 1, created_at: iso(-2),
  },
  {
    id: 'k3', source_message_id: null, source_thread_id: null, title: 'Send quarterly report to finance', description: null, kind: 'task',
    due_at: iso(-20), due_date_type: 'explicit', due_timezone: 'UTC', evidence: null, status: 'open', needs_confirmation: false,
    confidence: null, reminder_at: null, completed_at: null, created_by: 'user', version: 3, created_at: iso(-72),
  },
  {
    id: 'k4', source_message_id: 'e6', source_thread_id: 't6', title: 'Decide on Adatum laptop quotation', description: null, kind: 'task',
    due_at: iso(336), due_date_type: 'inferred', due_timezone: 'Asia/Kolkata', evidence: 'The quotation is valid for 15 days.',
    status: 'done', needs_confirmation: false, confidence: 0.55, reminder_at: null, completed_at: iso(-1), created_by: 'rules', version: 2, created_at: iso(-26),
  },
]

export const draft: Draft = {
  id: 'd1', account_id: 'a1', thread_id: 't1', reply_to_message_id: 'e1', to_addresses: ['priya.nair@northwind.example'],
  cc_addresses: [], subject: 'Re: Q4 vendor contract renewal – signature needed by Friday',
  body: 'Hi Priya,\n\nThanks for sending the renewal. I will review section 4 and come back to you by [CONFIRM DATE].\n\nBest regards,',
  tone: 'professional', custom_tone: null, status: 'draft', source: 'ai', model: 'example-model-70b', current_version_no: 2, version: 3,
  created_at: iso(-1), updated_at: iso(-0.5), notes_for_user: 'Confirm when you can review section 4.', placeholders: ['[CONFIRM DATE]'],
}

export const draftVersions: DraftVersion[] = [
  { id: 'v2', version_no: 2, subject: draft.subject, body: draft.body, tone: 'professional', source: 'ai', model: 'example-model-70b', created_at: iso(-0.5) },
  { id: 'v1', version_no: 1, subject: draft.subject, body: 'Hi Priya,\n\nThanks. I will sign it today.\n\nBest,', tone: 'concise', source: 'ai', model: 'example-model-70b', created_at: iso(-1) },
]

export const approvals: Approval[] = [
  {
    id: 'p1', account_id: 'a1', action_type: 'send_reply', source_message_id: 'e1', source_thread_id: 't1', draft_id: 'd1',
    params: { account_email: 'you@example.org', to: ['priya.nair@northwind.example'], cc: [], subject: draft.subject, body: draft.body.replace('[CONFIRM DATE]', 'Thursday') },
    params_hash: 'a'.repeat(64), explanation: `Send reply “${draft.subject}” to priya.nair@northwind.example`, proposed_by: 'user',
    state: 'PENDING_APPROVAL', expires_at: iso(20), approved_at: null, decided_at: null, decision_reason: null, created_at: iso(-0.3), execution: null,
  },
  {
    id: 'p2', account_id: 'a1', action_type: 'archive', source_message_id: null, source_thread_id: null, draft_id: null,
    params: { account_email: 'you@example.org', gmail_message_ids: ['g1', 'g2', 'g3'], label_name: null }, params_hash: 'b'.repeat(64),
    explanation: 'Archive 3 newsletter(s) from Product Digest', proposed_by: 'rules', state: 'PROPOSED', expires_at: iso(160),
    approved_at: null, decided_at: null, decision_reason: null, created_at: iso(-5), execution: null,
  },
  {
    id: 'p3', account_id: 'a1', action_type: 'send_reply', source_message_id: 'e3', source_thread_id: 't3', draft_id: 'd2',
    params: { account_email: 'you@example.org', to: ['arjun.mehta@fabrikam.example'], cc: [], subject: 'Re: Design review sync on Thursday?', body: 'Thursday 3 PM works for me.' },
    params_hash: 'c'.repeat(64), explanation: 'Send reply “Re: Design review sync on Thursday?” to arjun.mehta@fabrikam.example', proposed_by: 'user',
    state: 'SUCCEEDED', expires_at: iso(10), approved_at: iso(-4), decided_at: iso(-4), decision_reason: null, created_at: iso(-4.5),
    execution: { state: 'succeeded', attempt_count: 1, gmail_message_id: '18c2f0synthetic', result: {}, error: null, started_at: iso(-4), finished_at: iso(-4) },
  },
  {
    id: 'p4', account_id: 'a1', action_type: 'apply_label', source_message_id: null, source_thread_id: null, draft_id: null,
    params: { account_email: 'you@example.org', gmail_message_ids: ['g9'], label_name: 'MailPilot/Finance' }, params_hash: 'd'.repeat(64),
    explanation: 'Apply label “MailPilot/Finance” to 1 message(s)', proposed_by: 'user', state: 'FAILED', expires_at: iso(100),
    approved_at: iso(-6), decided_at: iso(-6), decision_reason: null, created_at: iso(-6.2),
    execution: { state: 'failed', attempt_count: 1, gmail_message_id: null, result: {}, error: 'GmailRateLimitError: Gmail rate limit or server error persisted', started_at: iso(-6), finished_at: iso(-6) },
  },
]

export const briefing: Briefing = {
  id: 'b1', briefing_date: '2026-10-28', status: 'succeeded', source: 'hybrid', created_at: iso(-1),
  narrative: 'Two urgent items and one suspicious request\n\nYour contract renewal with Northwind needs a signature by Friday, and a payroll bank-change request shows strong phishing indicators — verify it by phone before doing anything.',
  content: {
    generated_at: iso(-1), timezone: 'Asia/Kolkata', since: iso(-25),
    top_emails: [
      { id: 'e1', subject: emailItems[0]!.subject, from_name: 'Priya Nair', priority: 'HIGH', priority_score: 82, risk_level: 'none' },
      { id: 'e2', subject: emailItems[1]!.subject, from_name: 'CEO Office', priority: 'HIGH', priority_score: 64, risk_level: 'high' },
    ],
    due_today: [], upcoming: [{ id: 'k1', title: 'Sign Northwind Q4 contract renewal', due_at: iso(54) }],
    overdue_tasks: [{ id: 'k3', title: 'Send quarterly report to finance', due_at: iso(-20) }], overdue_commitments: [],
    awaiting_reply: [{ id: 'e3', subject: 'Design review sync on Thursday?', from_name: 'Arjun Mehta' }],
    meetings: [{ id: 'm1', title: 'Design review sync', start_at: null }],
    changes: { new_messages: 14, new_high: 2, new_risky: 1, tasks_completed: 1 }, pending_approvals: 1,
    recommended_actions: ['Resolve 1 overdue task(s), starting with “Send quarterly report to finance”.', 'Reply to 1 message(s) awaiting your response.'],
  },
}

export const contacts: Contact[] = [
  { id: 'c1', email: 'priya.nair@northwind.example', display_name: 'Priya Nair', domain: 'northwind.example', is_vip: true, importance: 85, notes: 'Account manager for the support contract.', relationship_summary: null, relationship_summary_at: null, inbound_count: 14, outbound_count: 9, last_inbound_at: iso(-2), last_outbound_at: iso(-30) },
  { id: 'c2', email: 'arjun.mehta@fabrikam.example', display_name: 'Arjun Mehta', domain: 'fabrikam.example', is_vip: false, importance: 60, notes: null, relationship_summary: null, relationship_summary_at: null, inbound_count: 6, outbound_count: 4, last_inbound_at: iso(-7), last_outbound_at: iso(-4) },
]

export const volumeData = Array.from({ length: 14 }, (_, i) => ({
  day: new Date(NOW.getTime() - (13 - i) * 86400_000).toISOString().slice(0, 10),
  received: [18, 22, 15, 30, 27, 9, 6, 24, 28, 19, 33, 25, 8, 12][i]!,
  sent: [4, 6, 3, 9, 7, 1, 0, 5, 8, 6, 10, 7, 2, 3][i]!,
}))
