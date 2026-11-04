from app.services.telegram_bot import rule_intent


def test_compose_with_address_or_name() -> None:
    i = rule_intent("send mail to rahul@example.org saying i will come at 5", False)
    assert (i.intent, i.recipient, i.message) == ("compose", "rahul@example.org", "i will come at 5")
    i = rule_intent("write to Priya Sharma that the report is ready", False)
    assert (i.intent, i.recipient, i.message) == ("compose", "Priya Sharma", "the report is ready")
    i = rule_intent("/send rahul: meeting moved to 5pm", False)
    assert (i.intent, i.recipient, i.message) == ("compose", "rahul", "meeting moved to 5pm")


def test_find_reply_and_help() -> None:
    assert rule_intent("show me the mail from infosys", False).intent == "find"
    assert rule_intent("/find offer letter", False).search_query == "offer letter"
    assert rule_intent("hi", False).intent == "help"
    r = rule_intent("reply that I accept the offer", True)
    assert (r.intent, r.message) == ("reply", "I accept the offer")
    assert rule_intent("reply that I accept the offer", False).intent == "find"
