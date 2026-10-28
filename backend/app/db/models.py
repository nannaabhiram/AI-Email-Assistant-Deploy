"""SQLAlchemy ORM mappings.

The Supabase SQL migrations in ``supabase/migrations`` are the source of truth for the
schema; these classes only map the tables for typed access from Python.
"""

from __future__ import annotations

import enum
from datetime import date, datetime, time
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import (
    ARRAY,
    BigInteger,
    Computed,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    Text,
    Time,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    type_annotation_map = {
        dict[str, Any]: JSONB,
        list[Any]: JSONB,
        list[str]: ARRAY(Text),
        UUID: PGUUID(as_uuid=True),
        datetime: DateTime(timezone=True),
        str: Text,
    }


class Priority(enum.StrEnum):
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"


class AnalysisSource(enum.StrEnum):
    llm = "llm"
    rules = "rules"
    hybrid = "hybrid"


class AnalysisStatus(enum.StrEnum):
    pending = "pending"
    queued = "queued"
    done = "done"
    failed = "failed"
    unavailable = "unavailable"


class AccountStatus(enum.StrEnum):
    active = "active"
    needs_reauth = "needs_reauth"
    disconnected = "disconnected"
    error = "error"


class RiskLevel(enum.StrEnum):
    none = "none"
    low = "low"
    medium = "medium"
    high = "high"


class DateType(enum.StrEnum):
    explicit = "explicit"
    inferred = "inferred"
    none = "none"


class TaskStatus(enum.StrEnum):
    suggested = "suggested"
    open = "open"
    done = "done"
    dismissed = "dismissed"


class CommitmentDirection(enum.StrEnum):
    by_me = "by_me"
    to_me = "to_me"


class CommitmentStatus(enum.StrEnum):
    suggested = "suggested"
    open = "open"
    fulfilled = "fulfilled"
    cancelled = "cancelled"


class DraftStatus(enum.StrEnum):
    draft = "draft"
    pending_approval = "pending_approval"
    approved = "approved"
    sent = "sent"
    discarded = "discarded"


class ActionType(enum.StrEnum):
    send_reply = "send_reply"
    archive = "archive"
    apply_label = "apply_label"
    remove_label = "remove_label"
    mark_read = "mark_read"
    mark_unread = "mark_unread"


class ApprovalState(enum.StrEnum):
    PROPOSED = "PROPOSED"
    PENDING_APPROVAL = "PENDING_APPROVAL"
    APPROVED = "APPROVED"
    EXECUTING = "EXECUTING"
    SUCCEEDED = "SUCCEEDED"
    REJECTED = "REJECTED"
    EXPIRED = "EXPIRED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class JobStatus(enum.StrEnum):
    queued = "queued"
    running = "running"
    succeeded = "succeeded"
    failed = "failed"
    dead = "dead"


def _pg_enum(enum_cls: type[enum.Enum], name: str) -> Enum:
    return Enum(enum_cls, name=name, create_type=False, values_callable=lambda e: [m.value for m in e])


PriorityCol = _pg_enum(Priority, "priority_level")
SourceCol = _pg_enum(AnalysisSource, "analysis_source")
DateTypeCol = _pg_enum(DateType, "date_type")

def uuid_pk() -> Mapped[UUID]:
    return mapped_column(primary_key=True, server_default=text("gen_random_uuid()"))


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now())


class Profile(TimestampMixin, Base):
    __tablename__ = "profiles"
    id: Mapped[UUID] = mapped_column(primary_key=True)
    email: Mapped[str | None]
    display_name: Mapped[str | None]


class UserSettings(TimestampMixin, Base):
    __tablename__ = "user_settings"
    user_id: Mapped[UUID] = mapped_column(ForeignKey("profiles.id"), primary_key=True)
    timezone: Mapped[str] = mapped_column(server_default="UTC")
    briefing_enabled: Mapped[bool] = mapped_column(server_default=text("true"))
    briefing_time: Mapped[time] = mapped_column(Time, server_default=text("'08:00'"))
    notification_prefs: Mapped[dict[str, Any]] = mapped_column(server_default=text("'{}'"))
    priority_thresholds: Mapped[dict[str, Any]] = mapped_column(server_default=text("'{}'"))
    scoring_weights: Mapped[dict[str, Any]] = mapped_column(server_default=text("'{}'"))
    review_confidence_threshold: Mapped[Decimal] = mapped_column(Numeric(3, 2), server_default=text("0.55"))
    auto_analyze: Mapped[bool] = mapped_column(server_default=text("true"))
    attachment_auto_extract: Mapped[bool] = mapped_column(server_default=text("false"))
    attachment_max_bytes: Mapped[int] = mapped_column(Integer, server_default=text("10485760"))
    store_attachments: Mapped[bool] = mapped_column(server_default=text("false"))
    email_retention_days: Mapped[int] = mapped_column(Integer, server_default=text("365"))
    sync_lookback_days: Mapped[int] = mapped_column(Integer, server_default=text("30"))
    sync_max_messages: Mapped[int] = mapped_column(Integer, server_default=text("2000"))
    default_reply_tone: Mapped[str] = mapped_column(server_default="professional")
    newsletter_digest: Mapped[bool] = mapped_column(server_default=text("true"))
    version: Mapped[int] = mapped_column(Integer, server_default=text("1"))


class ConnectedAccount(TimestampMixin, Base):
    __tablename__ = "connected_accounts"
    id: Mapped[UUID] = uuid_pk()
    user_id: Mapped[UUID] = mapped_column(ForeignKey("profiles.id"))
    provider: Mapped[str] = mapped_column(server_default="gmail")
    email_address: Mapped[str]
    status: Mapped[AccountStatus] = mapped_column(_pg_enum(AccountStatus, "account_status"), server_default="active")
    granted_scopes: Mapped[list[str]] = mapped_column(server_default=text("'{}'"))
    last_error: Mapped[str | None]


class OAuthCredential(Base):
    __tablename__ = "oauth_credentials"
    account_id: Mapped[UUID] = mapped_column(ForeignKey("connected_accounts.id"), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("profiles.id"))
    encrypted_refresh_token: Mapped[str]
    encrypted_access_token: Mapped[str | None]
    access_token_expires_at: Mapped[datetime | None]
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now())


class OAuthState(Base):
    __tablename__ = "oauth_states"
    state_hash: Mapped[str] = mapped_column(primary_key=True)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("profiles.id"))
    encrypted_code_verifier: Mapped[str]
    requested_scopes: Mapped[list[str]]
    redirect_path: Mapped[str] = mapped_column(server_default="/settings/accounts")
    expires_at: Mapped[datetime]
    consumed_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class SyncState(Base):
    __tablename__ = "sync_state"
    account_id: Mapped[UUID] = mapped_column(ForeignKey("connected_accounts.id"), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("profiles.id"))
    history_id: Mapped[str | None]
    status: Mapped[str] = mapped_column(server_default="idle")
    last_full_sync_at: Mapped[datetime | None]
    last_successful_sync_at: Mapped[datetime | None]
    last_attempt_at: Mapped[datetime | None]
    last_error: Mapped[str | None]
    messages_synced: Mapped[int] = mapped_column(BigInteger, server_default=text("0"))
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now())


class GmailLabel(Base):
    __tablename__ = "gmail_labels"
    account_id: Mapped[UUID] = mapped_column(ForeignKey("connected_accounts.id"), primary_key=True)
    label_id: Mapped[str] = mapped_column(primary_key=True)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("profiles.id"))
    name: Mapped[str]
    label_type: Mapped[str] = mapped_column(server_default="user")
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now())


class EmailThread(TimestampMixin, Base):
    __tablename__ = "email_threads"
    id: Mapped[UUID] = uuid_pk()
    user_id: Mapped[UUID] = mapped_column(ForeignKey("profiles.id"))
    account_id: Mapped[UUID] = mapped_column(ForeignKey("connected_accounts.id"))
    gmail_thread_id: Mapped[str]
    subject: Mapped[str | None]
    snippet: Mapped[str | None]
    message_count: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    participants: Mapped[list[Any]] = mapped_column(server_default=text("'[]'"))
    last_message_at: Mapped[datetime | None]


class EmailMessage(TimestampMixin, Base):
    __tablename__ = "email_messages"
    id: Mapped[UUID] = uuid_pk()
    user_id: Mapped[UUID] = mapped_column(ForeignKey("profiles.id"))
    account_id: Mapped[UUID] = mapped_column(ForeignKey("connected_accounts.id"))
    thread_id: Mapped[UUID] = mapped_column(ForeignKey("email_threads.id"))
    gmail_message_id: Mapped[str]
    gmail_thread_id: Mapped[str]
    rfc822_message_id: Mapped[str | None]
    in_reply_to: Mapped[str | None]
    references_header: Mapped[str | None]
    from_address: Mapped[str | None]
    from_name: Mapped[str | None]
    reply_to: Mapped[str | None]
    to_addresses: Mapped[list[Any]] = mapped_column(server_default=text("'[]'"))
    cc_addresses: Mapped[list[Any]] = mapped_column(server_default=text("'[]'"))
    bcc_addresses: Mapped[list[Any]] = mapped_column(server_default=text("'[]'"))
    subject: Mapped[str | None]
    snippet: Mapped[str | None]
    body_text: Mapped[str | None]
    has_html: Mapped[bool] = mapped_column(server_default=text("false"))
    label_ids: Mapped[list[str]] = mapped_column(server_default=text("'{}'"))
    is_unread: Mapped[bool] = mapped_column(server_default=text("false"))
    is_sent: Mapped[bool] = mapped_column(server_default=text("false"))
    internal_date: Mapped[datetime]
    size_estimate: Mapped[int | None] = mapped_column(Integer)
    headers: Mapped[dict[str, Any]] = mapped_column(server_default=text("'{}'"))
    links: Mapped[list[Any]] = mapped_column(server_default=text("'[]'"))
    calendar_data: Mapped[str | None]
    content_hash: Mapped[str | None]
    has_attachments: Mapped[bool] = mapped_column(server_default=text("false"))
    is_deleted: Mapped[bool] = mapped_column(server_default=text("false"))
    analysis_status: Mapped[AnalysisStatus] = mapped_column(
        _pg_enum(AnalysisStatus, "analysis_status"), server_default="pending"
    )


class EmailAttachment(TimestampMixin, Base):
    __tablename__ = "email_attachments"
    id: Mapped[UUID] = uuid_pk()
    user_id: Mapped[UUID] = mapped_column(ForeignKey("profiles.id"))
    message_id: Mapped[UUID] = mapped_column(ForeignKey("email_messages.id"))
    part_id: Mapped[str]
    filename: Mapped[str] = mapped_column(server_default="")
    mime_type: Mapped[str] = mapped_column(server_default="application/octet-stream")
    size_bytes: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    sha256: Mapped[str | None]
    storage_path: Mapped[str | None]
    extraction_status: Mapped[str] = mapped_column(server_default="not_requested")
    extraction_error: Mapped[str | None]
    extracted_text: Mapped[str | None]
    extraction: Mapped[dict[str, Any]] = mapped_column(server_default=text("'{}'"))
    risk_flags: Mapped[list[Any]] = mapped_column(server_default=text("'[]'"))


class EmailAnalysis(TimestampMixin, Base):
    __tablename__ = "email_analysis"
    id: Mapped[UUID] = uuid_pk()
    user_id: Mapped[UUID] = mapped_column(ForeignKey("profiles.id"))
    message_id: Mapped[UUID] = mapped_column(ForeignKey("email_messages.id"), unique=True)
    source: Mapped[AnalysisSource] = mapped_column(SourceCol)
    model: Mapped[str | None]
    prompt_version: Mapped[str | None]
    priority: Mapped[Priority] = mapped_column(PriorityCol)
    priority_score: Mapped[int] = mapped_column(Integer)
    rule_score: Mapped[int | None] = mapped_column(Integer)
    components: Mapped[dict[str, Any]] = mapped_column(server_default=text("'{}'"))
    user_override_priority: Mapped[Priority | None] = mapped_column(PriorityCol)
    effective_priority: Mapped[Priority] = mapped_column(
        PriorityCol, Computed("coalesce(user_override_priority, priority)", persisted=True)
    )
    summary: Mapped[str] = mapped_column(server_default="")
    explanation: Mapped[str] = mapped_column(server_default="")
    confidence: Mapped[Decimal] = mapped_column(Numeric(3, 2), server_default=text("0"))
    needs_review: Mapped[bool] = mapped_column(server_default=text("false"))
    reply_needed: Mapped[bool] = mapped_column(server_default=text("false"))
    action_required: Mapped[bool] = mapped_column(server_default=text("false"))
    suggested_action: Mapped[str | None]
    deadline_at: Mapped[datetime | None]
    deadline_timezone: Mapped[str | None]
    deadline_text: Mapped[str | None]
    deadline_type: Mapped[DateType] = mapped_column(DateTypeCol, server_default="none")
    entities: Mapped[dict[str, Any]] = mapped_column(server_default=text("'{}'"))
    category: Mapped[str | None]
    is_newsletter: Mapped[bool] = mapped_column(server_default=text("false"))
    is_notification: Mapped[bool] = mapped_column(server_default=text("false"))
    duplicate_of: Mapped[UUID | None] = mapped_column(ForeignKey("email_messages.id"))
    escalation_reason: Mapped[str | None]
    risk_level: Mapped[RiskLevel] = mapped_column(_pg_enum(RiskLevel, "risk_level"), server_default="none")
    risk_flags: Mapped[list[Any]] = mapped_column(server_default=text("'[]'"))
    analyzed_at: Mapped[datetime] = mapped_column(server_default=func.now())


class ThreadSummary(TimestampMixin, Base):
    __tablename__ = "thread_summaries"
    id: Mapped[UUID] = uuid_pk()
    user_id: Mapped[UUID] = mapped_column(ForeignKey("profiles.id"))
    thread_id: Mapped[UUID] = mapped_column(ForeignKey("email_threads.id"), unique=True)
    source: Mapped[AnalysisSource] = mapped_column(SourceCol)
    model: Mapped[str | None]
    overview: Mapped[str]
    key_points: Mapped[list[Any]] = mapped_column(server_default=text("'[]'"))
    decisions: Mapped[list[Any]] = mapped_column(server_default=text("'[]'"))
    open_questions: Mapped[list[Any]] = mapped_column(server_default=text("'[]'"))
    tasks: Mapped[list[Any]] = mapped_column(server_default=text("'[]'"))
    people: Mapped[list[Any]] = mapped_column(server_default=text("'[]'"))
    facts: Mapped[list[Any]] = mapped_column(server_default=text("'[]'"))
    inferences: Mapped[list[Any]] = mapped_column(server_default=text("'[]'"))
    next_action: Mapped[str | None]
    message_count_at_summary: Mapped[int] = mapped_column(Integer, server_default=text("0"))


class Contact(TimestampMixin, Base):
    __tablename__ = "contacts"
    id: Mapped[UUID] = uuid_pk()
    user_id: Mapped[UUID] = mapped_column(ForeignKey("profiles.id"))
    email: Mapped[str]
    display_name: Mapped[str | None]
    domain: Mapped[str | None]
    is_vip: Mapped[bool] = mapped_column(server_default=text("false"))
    importance: Mapped[int] = mapped_column(Integer, server_default=text("50"))
    notes: Mapped[str | None]
    relationship_summary: Mapped[str | None]
    relationship_summary_at: Mapped[datetime | None]
    inbound_count: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    outbound_count: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    last_inbound_at: Mapped[datetime | None]
    last_outbound_at: Mapped[datetime | None]


class ContactPreference(Base):
    __tablename__ = "contact_preferences"
    contact_id: Mapped[UUID] = mapped_column(ForeignKey("contacts.id"), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("profiles.id"))
    priority_floor: Mapped[Priority | None] = mapped_column(PriorityCol)
    priority_ceiling: Mapped[Priority | None] = mapped_column(PriorityCol)
    muted: Mapped[bool] = mapped_column(server_default=text("false"))
    digest: Mapped[bool] = mapped_column(server_default=text("false"))
    preferred_tone: Mapped[str | None]
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now())


class Task(TimestampMixin, Base):
    __tablename__ = "tasks"
    id: Mapped[UUID] = uuid_pk()
    user_id: Mapped[UUID] = mapped_column(ForeignKey("profiles.id"))
    source_message_id: Mapped[UUID | None] = mapped_column(ForeignKey("email_messages.id"))
    source_thread_id: Mapped[UUID | None] = mapped_column(ForeignKey("email_threads.id"))
    title: Mapped[str]
    description: Mapped[str | None]
    kind: Mapped[str] = mapped_column(server_default="task")
    due_at: Mapped[datetime | None]
    due_date_type: Mapped[DateType] = mapped_column(DateTypeCol, server_default="none")
    due_timezone: Mapped[str | None]
    evidence: Mapped[str | None]
    status: Mapped[TaskStatus] = mapped_column(_pg_enum(TaskStatus, "task_status"), server_default="open")
    needs_confirmation: Mapped[bool] = mapped_column(server_default=text("false"))
    confidence: Mapped[Decimal | None] = mapped_column(Numeric(3, 2))
    reminder_at: Mapped[datetime | None]
    reminded_at: Mapped[datetime | None]
    completed_at: Mapped[datetime | None]
    created_by: Mapped[str] = mapped_column(server_default="ai")
    version: Mapped[int] = mapped_column(Integer, server_default=text("1"))


class Commitment(TimestampMixin, Base):
    __tablename__ = "commitments"
    id: Mapped[UUID] = uuid_pk()
    user_id: Mapped[UUID] = mapped_column(ForeignKey("profiles.id"))
    source_message_id: Mapped[UUID | None] = mapped_column(ForeignKey("email_messages.id"))
    source_thread_id: Mapped[UUID | None] = mapped_column(ForeignKey("email_threads.id"))
    direction: Mapped[CommitmentDirection] = mapped_column(_pg_enum(CommitmentDirection, "commitment_direction"))
    counterparty: Mapped[str | None]
    description: Mapped[str]
    due_at: Mapped[datetime | None]
    due_date_type: Mapped[DateType] = mapped_column(DateTypeCol, server_default="none")
    evidence: Mapped[str | None]
    status: Mapped[CommitmentStatus] = mapped_column(
        _pg_enum(CommitmentStatus, "commitment_status"), server_default="open"
    )
    needs_confirmation: Mapped[bool] = mapped_column(server_default=text("false"))
    confidence: Mapped[Decimal | None] = mapped_column(Numeric(3, 2))
    created_by: Mapped[str] = mapped_column(server_default="ai")
    version: Mapped[int] = mapped_column(Integer, server_default=text("1"))


class Meeting(TimestampMixin, Base):
    __tablename__ = "meetings"
    id: Mapped[UUID] = uuid_pk()
    user_id: Mapped[UUID] = mapped_column(ForeignKey("profiles.id"))
    message_id: Mapped[UUID] = mapped_column(ForeignKey("email_messages.id"))
    title: Mapped[str | None]
    start_at: Mapped[datetime | None]
    end_at: Mapped[datetime | None]
    timezone: Mapped[str | None]
    location: Mapped[str | None]
    conference_url: Mapped[str | None]
    participants: Mapped[list[Any]] = mapped_column(server_default=text("'[]'"))
    agenda: Mapped[str | None]
    requested_response: Mapped[str | None]
    source: Mapped[str]
    status: Mapped[str] = mapped_column(server_default="detected")


class Draft(TimestampMixin, Base):
    __tablename__ = "drafts"
    id: Mapped[UUID] = uuid_pk()
    user_id: Mapped[UUID] = mapped_column(ForeignKey("profiles.id"))
    account_id: Mapped[UUID] = mapped_column(ForeignKey("connected_accounts.id"))
    thread_id: Mapped[UUID | None] = mapped_column(ForeignKey("email_threads.id"))
    reply_to_message_id: Mapped[UUID | None] = mapped_column(ForeignKey("email_messages.id"))
    to_addresses: Mapped[list[str]] = mapped_column(server_default=text("'{}'"))
    cc_addresses: Mapped[list[str]] = mapped_column(server_default=text("'{}'"))
    subject: Mapped[str] = mapped_column(server_default="")
    body: Mapped[str] = mapped_column(server_default="")
    tone: Mapped[str] = mapped_column(server_default="professional")
    custom_tone: Mapped[str | None]
    status: Mapped[DraftStatus] = mapped_column(_pg_enum(DraftStatus, "draft_status"), server_default="draft")
    source: Mapped[str] = mapped_column(server_default="ai")
    model: Mapped[str | None]
    current_version_no: Mapped[int] = mapped_column(Integer, server_default=text("1"))
    version: Mapped[int] = mapped_column(Integer, server_default=text("1"))


class DraftVersion(Base):
    __tablename__ = "draft_versions"
    id: Mapped[UUID] = uuid_pk()
    draft_id: Mapped[UUID] = mapped_column(ForeignKey("drafts.id"))
    user_id: Mapped[UUID] = mapped_column(ForeignKey("profiles.id"))
    version_no: Mapped[int] = mapped_column(Integer)
    subject: Mapped[str]
    body: Mapped[str]
    tone: Mapped[str]
    source: Mapped[str]
    model: Mapped[str | None]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class ActionApproval(TimestampMixin, Base):
    __tablename__ = "action_approvals"
    id: Mapped[UUID] = uuid_pk()
    user_id: Mapped[UUID] = mapped_column(ForeignKey("profiles.id"))
    account_id: Mapped[UUID] = mapped_column(ForeignKey("connected_accounts.id"))
    action_type: Mapped[ActionType] = mapped_column(_pg_enum(ActionType, "action_type"))
    source_message_id: Mapped[UUID | None] = mapped_column(ForeignKey("email_messages.id"))
    source_thread_id: Mapped[UUID | None] = mapped_column(ForeignKey("email_threads.id"))
    draft_id: Mapped[UUID | None] = mapped_column(ForeignKey("drafts.id"))
    params: Mapped[dict[str, Any]]
    params_hash: Mapped[str]
    explanation: Mapped[str]
    proposed_by: Mapped[str] = mapped_column(server_default="user")
    state: Mapped[ApprovalState] = mapped_column(
        _pg_enum(ApprovalState, "approval_state"), server_default="PENDING_APPROVAL"
    )
    expires_at: Mapped[datetime]
    approved_by: Mapped[UUID | None] = mapped_column(ForeignKey("profiles.id"))
    approved_at: Mapped[datetime | None]
    decided_at: Mapped[datetime | None]
    decision_reason: Mapped[str | None]
    idempotency_key: Mapped[str] = mapped_column(unique=True)
    version: Mapped[int] = mapped_column(Integer, server_default=text("1"))


class ActionExecution(Base):
    __tablename__ = "action_executions"
    id: Mapped[UUID] = uuid_pk()
    approval_id: Mapped[UUID] = mapped_column(ForeignKey("action_approvals.id"), unique=True)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("profiles.id"))
    state: Mapped[str]
    attempt_count: Mapped[int] = mapped_column(Integer, server_default=text("1"))
    rfc822_message_id: Mapped[str | None]
    gmail_message_id: Mapped[str | None]
    result: Mapped[dict[str, Any]] = mapped_column(server_default=text("'{}'"))
    error: Mapped[str | None]
    started_at: Mapped[datetime] = mapped_column(server_default=func.now())
    finished_at: Mapped[datetime | None]


class SearchDocument(Base):
    __tablename__ = "search_documents"
    id: Mapped[UUID] = uuid_pk()
    user_id: Mapped[UUID] = mapped_column(ForeignKey("profiles.id"))
    message_id: Mapped[UUID] = mapped_column(ForeignKey("email_messages.id"))
    attachment_id: Mapped[UUID | None] = mapped_column(ForeignKey("email_attachments.id"))
    title: Mapped[str] = mapped_column(server_default="")
    content: Mapped[str] = mapped_column(server_default="")
    tsv: Mapped[Any] = mapped_column(TSVECTOR, Computed("tsv", persisted=True), deferred=True)
    embedding_model: Mapped[str | None]
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now())


class Feedback(Base):
    __tablename__ = "feedback"
    id: Mapped[UUID] = uuid_pk()
    user_id: Mapped[UUID] = mapped_column(ForeignKey("profiles.id"))
    message_id: Mapped[UUID | None] = mapped_column(ForeignKey("email_messages.id"))
    kind: Mapped[str]
    previous_value: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    new_value: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    comment: Mapped[str | None]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class BriefingRun(Base):
    __tablename__ = "briefing_runs"
    id: Mapped[UUID] = uuid_pk()
    user_id: Mapped[UUID] = mapped_column(ForeignKey("profiles.id"))
    briefing_date: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(server_default="succeeded")
    source: Mapped[AnalysisSource] = mapped_column(SourceCol, server_default="rules")
    content: Mapped[dict[str, Any]] = mapped_column(server_default=text("'{}'"))
    narrative: Mapped[str | None]
    error: Mapped[str | None]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[UUID] = uuid_pk()
    user_id: Mapped[UUID] = mapped_column(ForeignKey("profiles.id"))
    kind: Mapped[str]
    title: Mapped[str]
    body: Mapped[str | None]
    link: Mapped[str | None]
    dedupe_key: Mapped[str | None]
    read_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class Job(Base):
    __tablename__ = "jobs"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[UUID | None] = mapped_column(ForeignKey("profiles.id"))
    job_type: Mapped[str]
    payload: Mapped[dict[str, Any]] = mapped_column(server_default=text("'{}'"))
    dedupe_key: Mapped[str | None]
    status: Mapped[JobStatus] = mapped_column(_pg_enum(JobStatus, "job_status"), server_default="queued")
    priority: Mapped[int] = mapped_column(Integer, server_default=text("100"))
    attempts: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    max_attempts: Mapped[int] = mapped_column(Integer, server_default=text("5"))
    run_at: Mapped[datetime] = mapped_column(server_default=func.now())
    locked_by: Mapped[str | None]
    locked_until: Mapped[datetime | None]
    last_error: Mapped[str | None]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now())
    finished_at: Mapped[datetime | None]


class LLMCall(Base):
    __tablename__ = "llm_calls"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[UUID | None] = mapped_column(ForeignKey("profiles.id"))
    request_id: Mapped[str]
    task: Mapped[str]
    model: Mapped[str | None]
    status: Mapped[str]
    latency_ms: Mapped[int | None] = mapped_column(Integer)
    input_chars: Mapped[int | None] = mapped_column(Integer)
    output_chars: Mapped[int | None] = mapped_column(Integer)
    attempts: Mapped[int] = mapped_column(Integer, server_default=text("1"))
    error_code: Mapped[str | None]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[UUID | None] = mapped_column(ForeignKey("profiles.id"))
    actor: Mapped[str]
    event: Mapped[str]
    entity_type: Mapped[str | None]
    entity_id: Mapped[str | None]
    details: Mapped[dict[str, Any]] = mapped_column(server_default=text("'{}'"))
    request_id: Mapped[str | None]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

