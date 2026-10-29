"""Typed API request and response schemas."""

from __future__ import annotations

from datetime import datetime, time
from decimal import Decimal
from typing import Any, Generic, Literal, TypeVar
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

T = TypeVar("T")
PriorityLiteral = Literal["HIGH", "MEDIUM", "LOW"]


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    limit: int
    offset: int


class Message(BaseModel):
    message: str


# --- Accounts / sync -----------------------------------------------------------------
class SyncStateOut(ORM):
    status: str
    history_id: str | None = None
    last_full_sync_at: datetime | None = None
    last_successful_sync_at: datetime | None = None
    last_attempt_at: datetime | None = None
    last_error: str | None = None
    messages_synced: int = 0


class AccountOut(ORM):
    id: UUID
    provider: str
    email_address: str
    status: str
    granted_scopes: list[str]
    last_error: str | None = None
    created_at: datetime
    can_send: bool = False
    can_modify: bool = False
    sync: SyncStateOut | None = None


class OAuthStartIn(BaseModel):
    scope_set: Literal["readonly", "send", "modify", "full"] = "readonly"
    redirect_path: str = Field(default="/settings/accounts", max_length=200)
    login_hint: str | None = Field(default=None, max_length=320)


class OAuthStartOut(BaseModel):
    authorization_url: str


class SyncIn(BaseModel):
    mode: Literal["auto", "full"] = "auto"


class DisconnectIn(BaseModel):
    delete_data: bool = False


class JobOut(ORM):
    id: int
    job_type: str
    status: str
    attempts: int
    max_attempts: int
    run_at: datetime
    last_error: str | None = None
    created_at: datetime
    finished_at: datetime | None = None


class JobRef(BaseModel):
    job_id: int | None
    status: str = "queued"
    detail: str | None = None


# --- Emails ----------------------------------------------------------------------------
class AnalysisOut(ORM):
    source: str
    model: str | None = None
    priority: PriorityLiteral
    effective_priority: PriorityLiteral
    user_override_priority: PriorityLiteral | None = None
    priority_score: int
    rule_score: int | None = None
    components: dict[str, Any]
    summary: str
    explanation: str
    confidence: Decimal
    needs_review: bool
    reply_needed: bool
    action_required: bool
    suggested_action: str | None = None
    deadline_at: datetime | None = None
    deadline_timezone: str | None = None
    deadline_text: str | None = None
    deadline_type: str
    entities: dict[str, Any]
    category: str | None = None
    is_newsletter: bool
    is_notification: bool
    duplicate_of: UUID | None = None
    escalation_reason: str | None = None
    risk_level: str
    risk_flags: list[Any]
    analyzed_at: datetime


class EmailListItemOut(BaseModel):
    id: UUID
    thread_id: UUID
    account_id: UUID
    subject: str | None
    snippet: str | None
    from_address: str | None
    from_name: str | None
    internal_date: datetime
    is_unread: bool
    has_attachments: bool
    label_ids: list[str]
    analysis_status: str
    priority: PriorityLiteral | None = None
    priority_score: int | None = None
    summary: str | None = None
    confidence: Decimal | None = None
    needs_review: bool | None = None
    reply_needed: bool | None = None
    action_required: bool | None = None
    deadline_at: datetime | None = None
    risk_level: str | None = None
    category: str | None = None
    analysis_source: str | None = None
    is_vip: bool = False


class AttachmentOut(ORM):
    id: UUID
    message_id: UUID
    filename: str
    mime_type: str
    size_bytes: int
    extraction_status: str
    extraction_error: str | None = None
    extraction: dict[str, Any]
    risk_flags: list[Any]
    stored: bool = False
    created_at: datetime


class MeetingOut(ORM):
    id: UUID
    message_id: UUID
    title: str | None
    start_at: datetime | None
    end_at: datetime | None
    timezone: str | None
    location: str | None
    conference_url: str | None
    participants: list[Any]
    agenda: str | None
    requested_response: str | None
    source: str
    status: str


class EmailDetailOut(BaseModel):
    id: UUID
    thread_id: UUID
    account_id: UUID
    gmail_message_id: str
    subject: str | None
    from_address: str | None
    from_name: str | None
    reply_to: str | None
    to_addresses: list[Any]
    cc_addresses: list[Any]
    internal_date: datetime
    is_unread: bool
    is_sent: bool
    label_ids: list[str]
    body_text: str | None
    has_html: bool
    links: list[Any]
    analysis_status: str
    analysis: AnalysisOut | None
    attachments: list[AttachmentOut]
    meetings: list[MeetingOut]
    tasks: list[TaskOut]
    commitments: list[CommitmentOut]


class PriorityOverrideIn(BaseModel):
    priority: PriorityLiteral | None
    comment: str | None = Field(default=None, max_length=500)


class ThreadSummaryOut(ORM):
    source: str
    model: str | None = None
    overview: str
    key_points: list[Any]
    decisions: list[Any]
    open_questions: list[Any]
    tasks: list[Any]
    people: list[Any]
    facts: list[Any]
    inferences: list[Any]
    next_action: str | None
    message_count_at_summary: int
    updated_at: datetime


class ThreadOut(BaseModel):
    id: UUID
    subject: str | None
    message_count: int
    participants: list[Any]
    last_message_at: datetime | None
    messages: list[EmailDetailOut]
    summary: ThreadSummaryOut | None
    summary_stale: bool


# --- Tasks / commitments --------------------------------------------------------------
class TaskOut(ORM):
    id: UUID
    source_message_id: UUID | None
    source_thread_id: UUID | None
    title: str
    description: str | None
    kind: str
    due_at: datetime | None
    due_date_type: str
    due_timezone: str | None
    evidence: str | None
    status: str
    needs_confirmation: bool
    confidence: Decimal | None
    reminder_at: datetime | None
    completed_at: datetime | None
    created_by: str
    version: int
    created_at: datetime


class TaskCreateIn(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    description: str | None = Field(default=None, max_length=5000)
    due_at: datetime | None = None
    source_message_id: UUID | None = None
    reminder_at: datetime | None = None


class TaskUpdateIn(BaseModel):
    version: int
    title: str | None = Field(default=None, min_length=1, max_length=500)
    description: str | None = Field(default=None, max_length=5000)
    due_at: datetime | None = None
    clear_due: bool = False
    status: Literal["suggested", "open", "done", "dismissed"] | None = None
    reminder_at: datetime | None = None


class CommitmentOut(ORM):
    id: UUID
    source_message_id: UUID | None
    direction: str
    counterparty: str | None
    description: str
    due_at: datetime | None
    due_date_type: str
    evidence: str | None
    status: str
    needs_confirmation: bool
    confidence: Decimal | None
    created_by: str
    version: int
    created_at: datetime


class CommitmentCreateIn(BaseModel):
    direction: Literal["by_me", "to_me"]
    description: str = Field(min_length=1, max_length=1000)
    counterparty: str | None = Field(default=None, max_length=320)
    due_at: datetime | None = None
    source_message_id: UUID | None = None


class CommitmentUpdateIn(BaseModel):
    version: int
    description: str | None = Field(default=None, min_length=1, max_length=1000)
    counterparty: str | None = Field(default=None, max_length=320)
    due_at: datetime | None = None
    clear_due: bool = False
    status: Literal["suggested", "open", "fulfilled", "cancelled"] | None = None


# --- Drafts / approvals ------------------------------------------------------------------
Tone = Literal["professional", "friendly", "formal", "concise", "custom"]


class DraftCreateIn(BaseModel):
    message_id: UUID
    tone: Tone = "professional"
    custom_tone: str | None = Field(default=None, max_length=300)
    instructions: str | None = Field(default=None, max_length=1000)
    use_ai: bool = True


class DraftRegenerateIn(BaseModel):
    tone: Tone = "professional"
    custom_tone: str | None = Field(default=None, max_length=300)
    instructions: str | None = Field(default=None, max_length=1000)


class DraftUpdateIn(BaseModel):
    version: int
    to: list[str] | None = Field(default=None, max_length=50)
    cc: list[str] | None = Field(default=None, max_length=50)
    subject: str | None = Field(default=None, max_length=998)
    body: str | None = Field(default=None, max_length=50000)
    tone: Tone | None = None


class DraftVersionOut(ORM):
    id: UUID
    version_no: int
    subject: str
    body: str
    tone: str
    source: str
    model: str | None
    created_at: datetime


class DraftOut(ORM):
    id: UUID
    account_id: UUID
    thread_id: UUID | None
    reply_to_message_id: UUID | None
    to_addresses: list[str]
    cc_addresses: list[str]
    subject: str
    body: str
    tone: str
    custom_tone: str | None
    status: str
    source: str
    model: str | None
    current_version_no: int
    version: int
    created_at: datetime
    updated_at: datetime
    notes_for_user: str | None = None
    placeholders: list[str] = Field(default_factory=list)


class DraftDetailOut(DraftOut):
    versions: list[DraftVersionOut] = Field(default_factory=list)
    approvals: list[ApprovalOut] = Field(default_factory=list)


class RequestApprovalIn(BaseModel):
    acknowledge_external_recipients: bool = False


class ExecutionOut(ORM):
    state: str
    attempt_count: int
    gmail_message_id: str | None
    result: dict[str, Any]
    error: str | None
    started_at: datetime
    finished_at: datetime | None


class ApprovalOut(ORM):
    id: UUID
    account_id: UUID
    action_type: str
    source_message_id: UUID | None
    source_thread_id: UUID | None
    draft_id: UUID | None
    params: dict[str, Any]
    params_hash: str
    explanation: str
    proposed_by: str
    state: str
    expires_at: datetime
    approved_at: datetime | None
    decided_at: datetime | None
    decision_reason: str | None
    created_at: datetime
    execution: ExecutionOut | None = None


class ApproveIn(BaseModel):
    params_hash: str = Field(min_length=64, max_length=64)


class DecisionIn(BaseModel):
    reason: str | None = Field(default=None, max_length=500)


class ProposeActionIn(BaseModel):
    action_type: Literal["archive", "apply_label", "remove_label", "mark_read", "mark_unread"]
    message_ids: list[UUID] = Field(min_length=1, max_length=200)
    label_name: str | None = Field(default=None, max_length=100)


# --- Search / briefings / contacts / settings ---------------------------------------------
class SearchIn(BaseModel):
    query: str = Field(min_length=2, max_length=500)
    limit: int = Field(default=20, ge=1, le=100)
    offset: int = Field(default=0, ge=0)


class SearchOut(BaseModel):
    target: str
    parser: str
    filters: dict[str, Any]
    results: list[dict[str, Any]]


class BriefingOut(ORM):
    id: UUID
    briefing_date: Any
    status: str
    source: str
    content: dict[str, Any]
    narrative: str | None
    error: str | None = None
    created_at: datetime


class ContactOut(ORM):
    id: UUID
    email: str
    display_name: str | None
    domain: str | None
    is_vip: bool
    importance: int
    notes: str | None
    relationship_summary: str | None
    relationship_summary_at: datetime | None
    inbound_count: int
    outbound_count: int
    last_inbound_at: datetime | None
    last_outbound_at: datetime | None


class ContactPreferenceOut(ORM):
    priority_floor: PriorityLiteral | None = None
    priority_ceiling: PriorityLiteral | None = None
    muted: bool = False
    digest: bool = False
    preferred_tone: str | None = None


class ContactDetailOut(ContactOut):
    preferences: ContactPreferenceOut | None = None
    recent_messages: list[EmailListItemOut] = Field(default_factory=list)
    open_commitments: list[CommitmentOut] = Field(default_factory=list)


class ContactCreateIn(BaseModel):
    email: str = Field(max_length=320)
    display_name: str | None = Field(default=None, max_length=200)
    is_vip: bool = False
    importance: int = Field(default=50, ge=0, le=100)


class ContactUpdateIn(BaseModel):
    display_name: str | None = Field(default=None, max_length=200)
    is_vip: bool | None = None
    importance: int | None = Field(default=None, ge=0, le=100)
    notes: str | None = Field(default=None, max_length=4000)


class ContactPreferenceIn(BaseModel):
    priority_floor: PriorityLiteral | None = None
    priority_ceiling: PriorityLiteral | None = None
    muted: bool = False
    digest: bool = False
    preferred_tone: str | None = Field(default=None, max_length=200)


class SettingsOut(ORM):
    timezone: str
    briefing_enabled: bool
    briefing_time: time
    notification_prefs: dict[str, Any]
    priority_thresholds: dict[str, Any]
    scoring_weights: dict[str, Any]
    review_confidence_threshold: Decimal
    auto_analyze: bool
    attachment_auto_extract: bool
    attachment_max_bytes: int
    store_attachments: bool
    email_retention_days: int
    sync_lookback_days: int
    sync_max_messages: int
    default_reply_tone: str
    newsletter_digest: bool
    version: int


class Thresholds(BaseModel):
    high: int = Field(ge=1, le=100)
    medium: int = Field(ge=0, le=99)

    @field_validator("medium")
    @classmethod
    def _below_high(cls, v: int, info: Any) -> int:
        if "high" in info.data and v >= info.data["high"]:
            raise ValueError("medium threshold must be below high threshold")
        return v


class Weights(BaseModel):
    deadline: float = Field(ge=0, le=1)
    action: float = Field(ge=0, le=1)
    impact: float = Field(ge=0, le=1)
    sender: float = Field(ge=0, le=1)
    context: float = Field(ge=0, le=1)


class SettingsUpdateIn(BaseModel):
    version: int
    timezone: str | None = Field(default=None, max_length=64)
    briefing_enabled: bool | None = None
    briefing_time: time | None = None
    notification_prefs: dict[str, bool] | None = None
    priority_thresholds: Thresholds | None = None
    scoring_weights: Weights | None = None
    review_confidence_threshold: float | None = Field(default=None, ge=0, le=1)
    auto_analyze: bool | None = None
    attachment_auto_extract: bool | None = None
    attachment_max_bytes: int | None = Field(default=None, ge=1024, le=52428800)
    store_attachments: bool | None = None
    email_retention_days: int | None = Field(default=None, ge=7, le=3650)
    sync_lookback_days: int | None = Field(default=None, ge=1, le=365)
    sync_max_messages: int | None = Field(default=None, ge=50, le=20000)
    default_reply_tone: Literal["professional", "friendly", "formal", "concise"] | None = None
    newsletter_digest: bool | None = None


class NotificationOut(ORM):
    id: UUID
    kind: str
    title: str
    body: str | None
    link: str | None
    read_at: datetime | None
    created_at: datetime


class AuditOut(ORM):
    id: int
    actor: str
    event: str
    entity_type: str | None
    entity_id: str | None
    details: dict[str, Any]
    request_id: str | None
    created_at: datetime


class ProfileOut(BaseModel):
    id: UUID
    email: str | None
    display_name: str | None
    is_demo: bool = False
    accounts: list[AccountOut]
    settings: SettingsOut | None


class ProfileUpdateIn(BaseModel):
    display_name: str = Field(min_length=1, max_length=120)


class DeleteAccountIn(BaseModel):
    confirm: Literal["DELETE"]


EmailDetailOut.model_rebuild()
DraftDetailOut.model_rebuild()
