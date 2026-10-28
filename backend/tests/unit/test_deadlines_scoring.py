from datetime import UTC, datetime, timedelta

from app.analysis.deadlines import extract_deadlines, parse_iso_datetime, primary_deadline
from app.analysis.rules import compute_rule_features
from app.analysis.scoring import compute_score, decide_priority, level_for

NOW = datetime(2026, 10, 28, 6, 0, tzinfo=UTC)  # Wednesday, 11:30 IST


def test_explicit_weekday_deadline_with_time_and_timezone() -> None:
    cands = extract_deadlines("Please sign it by Friday 5 PM IST.", NOW, "UTC")
    assert len(cands) == 1
    c = cands[0]
    assert c.date_type == "explicit"
    assert c.due_at.astimezone(UTC) == datetime(2026, 10, 30, 11, 30, tzinfo=UTC)


def test_dates_without_deadline_cue_are_not_deadlines() -> None:
    assert extract_deadlines("We met on 12 October and it was great.", NOW, "UTC") == []


def test_relative_and_inferred_deadlines() -> None:
    cands = extract_deadlines("Submit by tomorrow. The quote is valid for 15 days.", NOW, "Asia/Kolkata")
    kinds = {c.date_type for c in cands}
    assert kinds == {"explicit", "inferred"}
    tomorrow = next(c for c in cands if c.date_type == "explicit")
    assert tomorrow.due_at.date() == datetime(2026, 10, 29).date()
    assert primary_deadline(cands, NOW) is tomorrow


def test_iso_and_dmy_formats() -> None:
    assert extract_deadlines("due on 2026-11-05 at 14:00", NOW, "UTC")[0].due_at == datetime(2026, 11, 5, 14, 0, tzinfo=UTC)
    assert extract_deadlines("no later than 3rd November 2026", NOW, "UTC")[0].due_at.date().isoformat() == "2026-11-03"


def test_parse_iso_rejects_nonsense() -> None:
    assert parse_iso_datetime("not a date", "UTC") is None
    assert parse_iso_datetime("1800-01-01", "UTC") is None
    assert parse_iso_datetime("2026-11-01T10:00:00", "Asia/Kolkata").utcoffset() == timedelta(hours=5, minutes=30)


def _features(subject: str, body: str, **kw: object):  # type: ignore[no-untyped-def]
    defaults = dict(from_address="person@example.org", headers={}, label_ids=["INBOX"], now=NOW, user_timezone="UTC",
                    contact_importance=None, is_vip=False, has_outbound_history=False,
                    user_participated_in_thread=False, thread_message_count=1)
    defaults.update(kw)
    return compute_rule_features(subject=subject, body=body, **defaults)  # type: ignore[arg-type]


def test_newsletter_detection_caps_components() -> None:
    f = _features("Weekly digest", "Please review our new features!", headers={"list-unsubscribe": "<mailto:x>"})
    assert f.is_newsletter and f.category == "newsletter"
    assert max(f.components.values()) <= 20
    assert f.tasks == []


def test_rule_tasks_have_verbatim_evidence() -> None:
    body = "Hi Sam,\nCould you please review the attached contract by Friday 5 PM? Thanks."
    f = _features("Contract", body)
    assert f.tasks and f.tasks[0]["evidence"] in body
    assert f.deadline is not None


def test_score_and_thresholds_are_configurable() -> None:
    comps = {"deadline": 100, "action": 100, "impact": 0, "sender": 0, "context": 0}
    assert compute_score(comps) == 55
    assert compute_score(comps, {"deadline": 1, "action": 0, "impact": 0, "sender": 0, "context": 0}) == 100
    assert level_for(55) == "MEDIUM" and level_for(55, {"high": 50, "medium": 20}) == "HIGH"


def _decide(**kw: object):  # type: ignore[no-untyped-def]
    base = dict(components={"deadline": 0, "action": 10, "impact": 10, "sender": 10, "context": 10}, weights=None,
                thresholds=None, now=NOW, deadline_at=None, action_required=False, is_security_alert=False,
                is_incident=False, risk_level="none", confidence=0.9, review_threshold=0.55)
    base.update(kw)
    return decide_priority(**base)  # type: ignore[arg-type]


def test_security_alert_never_downgraded_even_with_low_score_or_mute() -> None:
    d = _decide(is_security_alert=True, muted=True, priority_ceiling="LOW")
    assert d.priority == "HIGH" and d.escalation_reason == "security_alert" and d.score < 40


def test_imminent_deadline_with_action_escalates() -> None:
    d = _decide(deadline_at=NOW + timedelta(hours=5), action_required=True)
    assert d.priority == "HIGH" and d.escalation_reason == "imminent_deadline"
    assert _decide(deadline_at=NOW + timedelta(hours=5), action_required=False).priority == "LOW"


def test_low_confidence_flags_review_without_changing_priority() -> None:
    d = _decide(confidence=0.3)
    assert d.priority == "LOW" and d.needs_review and "low_confidence" in d.review_reasons


def test_high_phishing_risk_escalates_and_requests_review() -> None:
    d = _decide(risk_level="high")
    assert d.priority == "HIGH" and d.needs_review


def test_contact_floor_and_ceiling() -> None:
    assert _decide(priority_floor="MEDIUM").priority == "MEDIUM"
    high = {"deadline": 100, "action": 100, "impact": 100, "sender": 100, "context": 100}
    assert _decide(components=high, priority_ceiling="MEDIUM").priority == "MEDIUM"
