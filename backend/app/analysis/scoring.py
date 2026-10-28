"""Configurable priority scoring and escalation rules.

score = sum(weight_i * component_i) over deadline, action, impact, sender, context.
Escalations guarantee that security alerts, critical incidents, high phishing risk and
imminent deadlines with a required action are never downgraded by a low numeric score.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

DEFAULT_WEIGHTS = {"deadline": 0.30, "action": 0.25, "impact": 0.20, "sender": 0.15, "context": 0.10}
DEFAULT_THRESHOLDS = {"high": 70, "medium": 40}
_ORDER = {"LOW": 0, "MEDIUM": 1, "HIGH": 2}

LLM_COMPONENT_MAP = {
    "deadline_urgency": "deadline",
    "action_required": "action",
    "impact_if_ignored": "impact",
    "sender_importance": "sender",
    "conversation_context": "context",
}


@dataclass(slots=True)
class PriorityDecision:
    priority: str
    score: int
    components: dict[str, int]
    escalation_reason: str | None
    needs_review: bool
    review_reasons: list[str]


def normalize_weights(weights: dict[str, Any] | None) -> dict[str, float]:
    merged = {**DEFAULT_WEIGHTS, **{k: float(v) for k, v in (weights or {}).items() if k in DEFAULT_WEIGHTS}}
    total = sum(max(0.0, v) for v in merged.values()) or 1.0
    return {k: max(0.0, v) / total for k, v in merged.items()}


def compute_score(components: dict[str, int], weights: dict[str, Any] | None = None) -> int:
    w = normalize_weights(weights)
    return max(0, min(100, round(sum(w[k] * components.get(k, 0) for k in w))))


def level_for(score: int, thresholds: dict[str, Any] | None = None) -> str:
    t = {**DEFAULT_THRESHOLDS, **(thresholds or {})}
    if score >= int(t["high"]):
        return "HIGH"
    if score >= int(t["medium"]):
        return "MEDIUM"
    return "LOW"


def blend_components(rule: dict[str, int], llm: dict[str, int] | None, llm_weight: float = 0.7) -> dict[str, int]:
    if not llm:
        return dict(rule)
    mapped = {LLM_COMPONENT_MAP.get(k, k): v for k, v in llm.items()}
    return {k: round(llm_weight * mapped.get(k, rule.get(k, 0)) + (1 - llm_weight) * rule.get(k, 0)) for k in rule}


def max_level(a: str, b: str) -> str:
    return a if _ORDER[a] >= _ORDER[b] else b


def min_level(a: str, b: str) -> str:
    return a if _ORDER[a] <= _ORDER[b] else b


def decide_priority(
    *,
    components: dict[str, int],
    weights: dict[str, Any] | None,
    thresholds: dict[str, Any] | None,
    now: datetime,
    deadline_at: datetime | None,
    action_required: bool,
    is_security_alert: bool,
    is_incident: bool,
    risk_level: str,
    confidence: float,
    review_threshold: float,
    llm_priority: str | None = None,
    priority_floor: str | None = None,
    priority_ceiling: str | None = None,
    muted: bool = False,
    is_newsletter: bool = False,
) -> PriorityDecision:
    score = compute_score(components, weights)
    priority = level_for(score, thresholds)
    reason: str | None = None
    review: list[str] = []

    if llm_priority and abs(_ORDER[llm_priority] - _ORDER[priority]) >= 1 and not is_newsletter:
        # Respect the model's judgement upward only by one level; a disagreement is flagged.
        if _ORDER[llm_priority] > _ORDER[priority]:
            priority = llm_priority if _ORDER[llm_priority] - _ORDER[priority] == 1 else "MEDIUM"
        if abs(_ORDER[llm_priority] - _ORDER[level_for(score, thresholds)]) >= 2:
            review.append("model_and_rules_disagree")

    if muted:
        priority = "LOW"
    if priority_ceiling:
        priority = min_level(priority, priority_ceiling)
    if priority_floor:
        priority = max_level(priority, priority_floor)

    # Non-negotiable escalations (applied last so preferences cannot suppress them).
    if is_security_alert:
        priority, reason = "HIGH", "security_alert"
    if is_incident:
        priority, reason = "HIGH", "critical_incident"
    if risk_level == "high":
        priority, reason = "HIGH", "phishing_risk"
        review.append("high_risk_content")
    if (
        deadline_at is not None
        and action_required
        and timedelta(0) <= deadline_at - now <= timedelta(hours=24)
        and not is_newsletter
    ):
        priority, reason = "HIGH", "imminent_deadline"

    if confidence < review_threshold:
        review.append("low_confidence")
    return PriorityDecision(priority, score, components, reason, bool(review), review)
