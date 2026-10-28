"""Structured output contracts for every LLM task. All model output is validated here."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

DateKind = Literal["explicit", "inferred", "none"]
RiskCode = Literal[
    "sender_impersonation",
    "suspicious_link",
    "credential_request",
    "payment_instruction_change",
    "dangerous_attachment",
    "urgency_pressure",
    "identity_content_mismatch",
    "prompt_injection",
    "other",
]
Category = Literal[
    "work", "personal", "finance", "security", "meeting", "newsletter", "notification", "marketing", "other"
]


class _Strict(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)


class PriorityComponents(_Strict):
    deadline_urgency: int = Field(ge=0, le=100)
    action_required: int = Field(ge=0, le=100)
    impact_if_ignored: int = Field(ge=0, le=100)
    sender_importance: int = Field(ge=0, le=100)
    conversation_context: int = Field(ge=0, le=100)


class Deadline(_Strict):
    text: str | None = Field(default=None, max_length=200, description="Exact wording from the email")
    iso_datetime: str | None = Field(default=None, description="ISO 8601 datetime if determinable, else null")
    timezone: str | None = Field(default=None, max_length=64)
    date_type: DateKind = "none"


class Amount(_Strict):
    value: str = Field(max_length=64)
    currency: str | None = Field(default=None, max_length=8)
    context: str = Field(default="", max_length=200)


class DateMention(_Strict):
    text: str = Field(max_length=120)
    iso: str | None = None


class Entities(_Strict):
    people: list[str] = Field(default_factory=list, max_length=20)
    organizations: list[str] = Field(default_factory=list, max_length=20)
    amounts: list[Amount] = Field(default_factory=list, max_length=20)
    dates: list[DateMention] = Field(default_factory=list, max_length=20)


class RiskFlag(_Strict):
    code: RiskCode
    detail: str = Field(max_length=300)


class ExtractedTask(_Strict):
    title: str = Field(min_length=1, max_length=200)
    kind: Literal["task", "reply_requested"] = "task"
    evidence: str = Field(min_length=1, max_length=500, description="Verbatim quote from the email")
    due_iso: str | None = None
    date_type: DateKind = "none"
    confidence: float = Field(ge=0, le=1)


class ExtractedCommitment(_Strict):
    direction: Literal["by_me", "to_me"]
    counterparty: str | None = Field(default=None, max_length=200)
    description: str = Field(min_length=1, max_length=300)
    evidence: str = Field(min_length=1, max_length=500)
    due_iso: str | None = None
    date_type: DateKind = "none"
    confidence: float = Field(ge=0, le=1)


class MeetingInfo(_Strict):
    title: str | None = Field(default=None, max_length=200)
    start_iso: str | None = None
    end_iso: str | None = None
    timezone: str | None = Field(default=None, max_length=64)
    location: str | None = Field(default=None, max_length=300)
    conference_url: str | None = Field(default=None, max_length=500)
    participants: list[str] = Field(default_factory=list, max_length=30)
    agenda: str | None = Field(default=None, max_length=1000)
    requested_response: str | None = Field(default=None, max_length=200)


class EmailAnalysisOutput(_Strict):
    summary: str = Field(min_length=1, max_length=500)
    explanation: str = Field(min_length=1, max_length=800)
    priority: Literal["HIGH", "MEDIUM", "LOW"]
    components: PriorityComponents
    confidence: float = Field(ge=0, le=1)
    reply_needed: bool
    action_required: bool
    suggested_next_action: str | None = Field(default=None, max_length=300)
    deadline: Deadline | None = None
    entities: Entities = Field(default_factory=Entities)
    category: Category = "other"
    is_newsletter: bool = False
    is_notification: bool = False
    risk_flags: list[RiskFlag] = Field(default_factory=list, max_length=10)
    tasks: list[ExtractedTask] = Field(default_factory=list, max_length=10)
    commitments: list[ExtractedCommitment] = Field(default_factory=list, max_length=10)
    meeting: MeetingInfo | None = None
    prompt_injection_detected: bool = False


class Person(_Strict):
    name: str = Field(max_length=120)
    email: str | None = Field(default=None, max_length=320)
    role: str | None = Field(default=None, max_length=200)


class SummaryTask(_Strict):
    title: str = Field(max_length=200)
    owner: str | None = Field(default=None, max_length=120)
    due: str | None = Field(default=None, max_length=120)


class ThreadSummaryOutput(_Strict):
    overview: str = Field(min_length=1, max_length=300, description="One line")
    key_points: list[str] = Field(default_factory=list, max_length=10)
    decisions: list[str] = Field(default_factory=list, max_length=10)
    open_questions: list[str] = Field(default_factory=list, max_length=10)
    tasks: list[SummaryTask] = Field(default_factory=list, max_length=10)
    people: list[Person] = Field(default_factory=list, max_length=20)
    facts: list[str] = Field(default_factory=list, max_length=15, description="Stated explicitly in the thread")
    inferences: list[str] = Field(default_factory=list, max_length=10, description="Reasonable but not stated")
    next_action: str | None = Field(default=None, max_length=300)


class ReplyDraftOutput(_Strict):
    body: str = Field(min_length=1, max_length=8000)
    placeholders: list[str] = Field(default_factory=list, max_length=10,
                                    description="Information the user must fill in, e.g. [DATE]")
    notes_for_user: str | None = Field(default=None, max_length=500)


class SearchQueryOutput(_Strict):
    target: Literal["emails", "tasks", "commitments"] = "emails"
    keywords: list[str] = Field(default_factory=list, max_length=10)
    sender: str | None = Field(default=None, max_length=200)
    date_from: str | None = None
    date_to: str | None = None
    priority: Literal["HIGH", "MEDIUM", "LOW"] | None = None
    requires_reply: bool | None = None
    requires_action: bool | None = None
    due_today: bool | None = None
    has_attachment: bool | None = None
    category: Category | None = None
    amount: str | None = Field(default=None, max_length=64)
    only_open: bool | None = None
    sort: Literal["relevance", "newest", "oldest"] = "relevance"
    latest_only: bool = False


class AttachmentDeadline(_Strict):
    description: str = Field(max_length=300)
    iso: str | None = None
    evidence: str = Field(max_length=300)


class AttachmentAnalysisOutput(_Strict):
    summary: str = Field(min_length=1, max_length=800)
    document_type: Literal["invoice", "quotation", "contract", "report", "receipt", "schedule", "other"] = "other"
    amounts: list[Amount] = Field(default_factory=list, max_length=20)
    invoice_numbers: list[str] = Field(default_factory=list, max_length=10)
    quotation_values: list[Amount] = Field(default_factory=list, max_length=10)
    dates: list[DateMention] = Field(default_factory=list, max_length=20)
    deadlines: list[AttachmentDeadline] = Field(default_factory=list, max_length=10)
    deliverables: list[str] = Field(default_factory=list, max_length=15)
    inconsistencies: list[str] = Field(default_factory=list, max_length=10)
    prompt_injection_detected: bool = False


class BriefingNarrativeOutput(_Strict):
    headline: str = Field(min_length=1, max_length=200)
    narrative: str = Field(min_length=1, max_length=1500)
    recommended_actions: list[str] = Field(default_factory=list, max_length=8)


class ContactSummaryOutput(_Strict):
    relationship_summary: str = Field(min_length=1, max_length=800)
    open_commitments: list[str] = Field(default_factory=list, max_length=10)
    recent_decisions: list[str] = Field(default_factory=list, max_length=10)
    communication_notes: str | None = Field(default=None, max_length=300)
