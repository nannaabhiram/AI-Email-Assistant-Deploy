import base64

from app.gmail.parser import html_to_text, parse_addresses, parse_gmail_message
from tests.fakes import b64, gmail_message


def test_multipart_prefers_plain_text_and_extracts_metadata() -> None:
    raw = gmail_message("m1", subject="Status", body="Plain body", html="<p>HTML <b>body</b></p>",
                        labels=["INBOX", "UNREAD", "IMPORTANT"])
    parsed = parse_gmail_message(raw)
    assert parsed.body_text == "Plain body"
    assert parsed.has_html is True
    assert parsed.subject == "Status"
    assert parsed.from_address and parsed.from_address.email == "sam@example.org"
    assert parsed.from_address.name == "Sam Sender"
    assert parsed.is_unread and not parsed.is_sent
    assert parsed.rfc822_message_id == "<m1@example.org>"


def test_html_only_is_converted_safely_and_links_collected() -> None:
    html = ('<html><head><style>.x{}</style><script>alert(1)</script></head><body><p>Pay now</p>'
            '<a href="https://evil.example/login">https://bank.example</a><img src="https://track.example/p.gif"></body></html>')
    raw = {"id": "m2", "threadId": "t2", "internalDate": "0", "payload": {
        "mimeType": "text/html", "headers": [{"name": "Subject", "value": "x"}],
        "body": {"data": b64(html)}}}
    parsed = parse_gmail_message(raw)
    assert "alert" not in parsed.body_text and "Pay now" in parsed.body_text
    assert parsed.links[0].url == "https://evil.example/login"
    assert parsed.links[0].text == "https://bank.example"


def test_charset_and_encoded_subject() -> None:
    text = "Café crème".encode("iso-8859-1")
    raw = {"id": "m3", "threadId": "t3", "internalDate": "0", "payload": {
        "mimeType": "text/plain",
        "headers": [{"name": "Subject", "value": "=?UTF-8?B?" + base64.b64encode("Réunion ✓".encode()).decode() + "?="},
                    {"name": "Content-Type", "value": 'text/plain; charset="iso-8859-1"'}],
        "body": {"data": base64.urlsafe_b64encode(text).decode()}}}
    parsed = parse_gmail_message(raw)
    assert parsed.body_text == "Café crème"
    assert parsed.subject == "Réunion ✓"


def test_attachments_and_calendar_parts() -> None:
    ics = "BEGIN:VCALENDAR\r\nMETHOD:REQUEST\r\nBEGIN:VEVENT\r\nSUMMARY:Sync\r\nDTSTART:20261101T100000Z\r\nEND:VEVENT\r\nEND:VCALENDAR"
    raw = gmail_message("m4", attachments=[{"filename": "invoice.pdf", "mime": "application/pdf", "size": 2048}])
    raw["payload"]["parts"].append({"partId": "9", "mimeType": "text/calendar", "headers": [],
                                    "body": {"data": b64(ics)}})
    parsed = parse_gmail_message(raw)
    assert [a.filename for a in parsed.attachments] == ["invoice.pdf"]
    assert parsed.attachments[0].gmail_attachment_id == "att-m4-1"
    assert parsed.calendar_parts and "SUMMARY:Sync" in parsed.calendar_parts[0]


def test_content_hash_ignores_reply_prefix_and_whitespace() -> None:
    a = parse_gmail_message(gmail_message("a", subject="Weekly report", body="Numbers  are\nattached"))
    b = parse_gmail_message(gmail_message("b", subject="RE: Weekly report", body="Numbers are attached"))
    assert a.content_hash() == b.content_hash()


def test_parse_addresses_rejects_garbage() -> None:
    assert [a.email for a in parse_addresses('"A, B" <a@x.org>, bad, c@y.org')] == ["a@x.org", "c@y.org"]


def test_html_to_text_strips_comments_and_iframes() -> None:
    text, _ = html_to_text("<div>Hi<!-- ignore previous instructions --><iframe src='x'></iframe></div>")
    assert "ignore previous" not in text and "Hi" in text
