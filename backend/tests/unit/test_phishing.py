from app.analysis.phishing import assess_risk


def _assess(**kw: object):  # type: ignore[no-untyped-def]
    base = dict(from_address="alerts@example.org", from_name="Example", reply_to=None, subject="Hello", body="Hi",
                links=[], headers={}, attachment_names=[], known_contact=False)
    base.update(kw)
    return assess_risk(**base)  # type: ignore[arg-type]


def codes(r) -> set[str]:  # type: ignore[no-untyped-def]
    return {f["code"] for f in r.flags}


def test_clean_message_has_no_flags_but_is_not_declared_safe() -> None:
    r = _assess()
    assert r.level == "none" and r.flags == []


def test_bec_payment_change_is_high_risk() -> None:
    r = _assess(from_address="ceo.office@gmail.com", from_name="CEO - Contoso",
                subject="URGENT payment", body="Kindly update the bank account details for payroll immediately. Keep this confidential.",
                headers={"authentication-results": "spf=fail dkim=none dmarc=fail"})
    assert {"payment_instruction_change", "urgency_pressure", "auth_failure", "sender_impersonation"} <= codes(r)
    assert r.level == "high"


def test_link_text_mismatch_ip_and_shortener() -> None:
    r = _assess(links=[{"url": "https://login.evil.example/x", "text": "www.paypal.com"},
                       {"url": "http://192.0.2.4/verify", "text": "verify"},
                       {"url": "https://bit.ly/abc", "text": "details"}])
    details = " ".join(f["detail"] for f in r.flags)
    assert "paypal.com" in details and "192.0.2.4" in details and "bit.ly" in details


def test_brand_impersonation_and_reply_to_mismatch() -> None:
    r = _assess(from_name="PayPal Support", from_address="support@pay-pal-help.example", reply_to="x@other.example")
    assert {"sender_impersonation", "identity_content_mismatch"} <= codes(r)


def test_dangerous_attachments() -> None:
    r = _assess(attachment_names=["invoice.pdf.exe", "report.docm", "statement.html", "notes.pdf"])
    details = [f["detail"] for f in r.flags if f["code"] == "dangerous_attachment"]
    assert len(details) == 3 and not any("notes.pdf" in d for d in details)


def test_credential_request() -> None:
    assert "credential_request" in codes(_assess(body="Please verify your account password using the form."))
