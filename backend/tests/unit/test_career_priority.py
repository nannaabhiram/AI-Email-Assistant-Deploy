from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch

import pytest

from app.analysis.rules import compute_rule_features
from app.analysis.scoring import decide_priority

NOW = datetime(2026, 11, 4, 6, 0, tzinfo=UTC)


def features(subject: str, body: str, *, frm: str = "hr@acme.com", headers: dict[str, str] | None = None,
             labels: list[str] | None = None):
    return compute_rule_features(
        subject=subject, body=body, from_address=frm, headers=headers or {}, label_ids=labels or [], now=NOW,
        user_timezone="Asia/Kolkata", contact_importance=None, is_vip=False, has_outbound_history=False,
        user_participated_in_thread=False, thread_message_count=1,
    )


def decide(f, **kw):
    return decide_priority(
        components=f.components, weights=None, thresholds=None, now=NOW, deadline_at=None,
        action_required=f.action_required, is_security_alert=f.is_security_alert, is_incident=f.is_incident,
        risk_level=kw.pop("risk_level", "none"), confidence=0.9, review_threshold=0.55,
        is_newsletter=f.is_newsletter, is_career_opportunity=f.is_career_opportunity, **kw,
    )


@pytest.mark.parametrize(("subject", "body"), [
    ("Internship Offer - Software Engineering Intern", "Dear Abhiram, we are pleased to offer you the internship."),
    ("Your offer letter from Acme", "Please find attached your offer letter for the role of SDE Intern."),
    ("Congratulations!", "You have been selected for the Summer Internship Program at Acme."),
    ("Interview invitation - Data Science Intern", "We would like to invite you to a technical interview."),
    ("Shortlisted", "You have been shortlisted for the next round of the hiring process."),
])
def test_career_mail_is_top_priority(subject: str, body: str) -> None:
    f = features(subject, body, frm="no-reply@greenhouse.io", labels=["CATEGORY_UPDATES"])
    assert f.is_career_opportunity and f.category == "career"
    d = decide(f)
    assert d.priority == "HIGH" and d.score >= 95 and d.escalation_reason == "career_opportunity"


def test_offer_beats_mute_and_ceiling() -> None:
    f = features("Offer letter", "Attached is your internship offer letter. Stipend 40k.")
    d = decide(f, muted=True, priority_ceiling="LOW")
    assert d.priority == "HIGH"


def test_job_alert_newsletter_is_not_career() -> None:
    f = features("25 new internships for you", "Recommended internships: apply now. Offer letter guaranteed!",
                 frm="jobs@internshala.com", headers={"list-unsubscribe": "<mailto:x@y>"})
    assert not f.is_career_opportunity
    assert decide(f).priority == "LOW"


def test_bulk_interview_webinar_is_not_career() -> None:
    f = features("Ace your next interview", "Join our webinar on interview tips. Schedule your interview prep.",
                 headers={"list-id": "news.example.com"})
    assert not f.is_career_opportunity


def test_phishing_offer_is_flagged_not_celebrated() -> None:
    f = features("Job offer", "We are pleased to offer you a job. Pay the registration fee to receive your offer letter.")
    d = decide(f, risk_level="high")
    assert d.priority == "HIGH" and d.escalation_reason == "phishing_risk"


def test_plain_work_mail_unaffected() -> None:
    f = features("Lunch?", "Want to grab lunch tomorrow?")
    assert not f.is_career_opportunity and decide(f).escalation_reason is None


async def test_push_send_sends_ntfy_and_skips_on_retry() -> None:
    from app.jobs import handlers

    payload = {"user_id": "00000000-0000-0000-0000-000000000001", "notification_id": "n1", "title": "Career: Offer",
               "body": "From HR", "link": "/emails/x", "kind": "important", "priority": "high"}
    with patch.object(handlers, "_send_ntfy_alert", AsyncMock(return_value=True)) as ntfy, \
         patch.object(handlers, "send_to_user", AsyncMock(return_value={"sent": 0, "disabled": 0})):
        await handlers.handle_push_send(payload)
        await handlers.handle_push_send({**payload, "ntfy_done": True})
    assert ntfy.await_count == 1
