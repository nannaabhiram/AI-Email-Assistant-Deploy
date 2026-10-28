"""Deterministic spam / phishing / fraud indicators.

Absence of flags never means an email is safe; the UI states this explicitly.
"""

from __future__ import annotations

import ipaddress
import re
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse

DANGEROUS_EXTENSIONS = {
    ".exe", ".scr", ".bat", ".cmd", ".com", ".pif", ".js", ".jse", ".vbs", ".vbe", ".wsf", ".wsh", ".ps1",
    ".msi", ".msp", ".hta", ".jar", ".lnk", ".iso", ".img", ".vhd", ".dll", ".cpl", ".reg", ".apk",
}
MACRO_EXTENSIONS = {".docm", ".xlsm", ".pptm", ".dotm", ".xlam"}
RISKY_CONTAINER_EXTENSIONS = {".html", ".htm", ".svg", ".zip", ".rar", ".7z"}
SHORTENERS = {"bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd", "buff.ly", "rebrand.ly", "cutt.ly", "s.id"}
FREE_MAIL = {"gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "proton.me", "protonmail.com", "icloud.com",
             "aol.com", "gmx.com", "yandex.com", "mail.com"}
BRANDS = ["paypal", "microsoft", "office365", "google", "apple", "amazon", "netflix", "dhl", "fedex", "bank",
          "hdfc", "icici", "sbi", "linkedin", "docusign", "dropbox", "adobe"]

_CREDENTIAL = re.compile(
    r"\b(verify|confirm|update|validate|re-?activate|unlock)\b.{0,40}\b(account|password|login|credentials?|"
    r"identity|sign[- ]?in)\b|\b(enter|provide|send)\b.{0,30}\b(password|otp|one[- ]time (?:code|password)|pin|cvv)\b",
    re.I | re.S,
)
_PAYMENT_CHANGE = re.compile(
    r"\b(new|updated?|change[d]?|different)\b.{0,40}\b(bank (?:account|details)|account (?:number|details)|"
    r"iban|swift|ifsc|wire instructions|payment (?:details|instructions))\b|\bwire transfer\b.{0,40}\burgent",
    re.I | re.S,
)
_GIFT_CARD = re.compile(r"\b(gift ?cards?|itunes cards?|google play cards?|crypto(?:currency)? wallet)\b", re.I)
_URGENCY = re.compile(
    r"\b(urgent(?:ly)?|immediately|within \d+ hours?|asap|act now|final (?:notice|warning)|account (?:will be )?"
    r"(?:suspended|closed|locked)|keep this confidential|do not (?:call|tell)|right away)\b",
    re.I,
)


@dataclass(slots=True)
class RiskAssessment:
    level: str  # none | low | medium | high
    flags: list[dict[str, str]]
    score: int


def _domain(email: str | None) -> str:
    return (email or "").rsplit("@", 1)[-1].lower()


def _registrable(host: str) -> str:
    parts = host.lower().strip(".").split(".")
    if len(parts) >= 3 and len(parts[-1]) == 2 and parts[-2] in {"co", "com", "org", "net", "gov", "ac", "edu"}:
        return ".".join(parts[-3:])
    return ".".join(parts[-2:])


def _flag(flags: list[dict[str, str]], code: str, detail: str) -> None:
    if not any(f["code"] == code and f["detail"] == detail for f in flags):
        flags.append({"code": code, "detail": detail[:300]})


def assess_risk(
    *,
    from_address: str | None,
    from_name: str | None,
    reply_to: str | None,
    subject: str,
    body: str,
    links: list[dict[str, Any]],
    headers: dict[str, str],
    attachment_names: list[str],
    known_contact: bool,
) -> RiskAssessment:
    flags: list[dict[str, str]] = []
    score = 0
    sender_domain = _domain(from_address)
    text = f"{subject}\n{body[:20000]}"

    # Authentication results recorded by the receiving server.
    auth = headers.get("authentication-results", "").lower()
    if auth and any(f"{k}=fail" in auth for k in ("spf", "dkim", "dmarc")):
        _flag(flags, "auth_failure", "Sender authentication (SPF/DKIM/DMARC) failed")
        score += 25

    # Display-name impersonation: name contains an address or a brand that does not match the domain.
    name = (from_name or "").lower()
    embedded = re.search(r"[\w.+-]+@([\w-]+\.[\w.-]+)", name)
    if embedded and _registrable(embedded.group(1)) != _registrable(sender_domain):
        _flag(flags, "sender_impersonation", f"Display name shows {embedded.group(0)} but mail is from {sender_domain}")
        score += 30
    for brand in BRANDS:
        if brand in name and brand not in sender_domain:
            _flag(flags, "sender_impersonation", f"Display name mentions '{brand}' but sender domain is {sender_domain}")
            score += 20
            break
    if re.search(r"\b(ceo|cfo|director|president|managing director)\b", name) and sender_domain in FREE_MAIL:
        _flag(flags, "sender_impersonation", "Executive title used from a free webmail address")
        score += 20

    if reply_to and _registrable(_domain(reply_to)) != _registrable(sender_domain):
        _flag(flags, "identity_content_mismatch", f"Reply-To goes to a different domain ({_domain(reply_to)})")
        score += 15
    if sender_domain.startswith("xn--") or ".xn--" in sender_domain:
        _flag(flags, "sender_impersonation", "Sender domain uses punycode (possible look-alike)")
        score += 20

    # Links.
    for link in links[:100]:
        url = str(link.get("url", ""))
        anchor = str(link.get("text", ""))
        try:
            host = (urlparse(url).hostname or "").lower()
        except ValueError:
            continue
        if not host:
            continue
        try:
            ipaddress.ip_address(host)
            _flag(flags, "suspicious_link", f"Link points to a raw IP address ({host})")
            score += 25
            continue
        except ValueError:
            pass
        if host in SHORTENERS:
            _flag(flags, "suspicious_link", f"Shortened link hides its destination ({host})")
            score += 10
        if host.startswith("xn--") or ".xn--" in host:
            _flag(flags, "suspicious_link", f"Link uses a punycode domain ({host})")
            score += 20
        shown = re.search(r"(?:https?://)?([\w-]+(?:\.[\w-]+)+)", anchor)
        if shown and "." in shown.group(1) and _registrable(shown.group(1)) != _registrable(host):
            _flag(flags, "suspicious_link", f"Link text shows {shown.group(1)} but opens {host}")
            score += 25
    for m in re.finditer(r"https?://(\d{1,3}(?:\.\d{1,3}){3})", body[:20000]):
        _flag(flags, "suspicious_link", f"Link points to a raw IP address ({m.group(1)})")
        score += 25

    if _CREDENTIAL.search(text):
        _flag(flags, "credential_request", "Asks you to verify or provide account credentials")
        score += 25
    if _PAYMENT_CHANGE.search(text):
        _flag(flags, "payment_instruction_change", "Requests new or changed payment / bank details")
        score += 30
    if _GIFT_CARD.search(text):
        _flag(flags, "payment_instruction_change", "Requests payment by gift cards or crypto")
        score += 30
    urgency_hits = len(_URGENCY.findall(text))
    if urgency_hits:
        _flag(flags, "urgency_pressure", "Uses urgency or secrecy pressure")
        score += min(20, 8 * urgency_hits)

    for filename in attachment_names:
        lower = filename.lower()
        ext = "." + lower.rsplit(".", 1)[-1] if "." in lower else ""
        double = re.search(r"\.(pdf|docx?|xlsx?|jpg|png|txt)\.(\w+)$", lower)
        if ext in DANGEROUS_EXTENSIONS or (double and "." + double.group(2) in DANGEROUS_EXTENSIONS):
            _flag(flags, "dangerous_attachment", f"Executable or script attachment: {filename}")
            score += 40
        elif ext in MACRO_EXTENSIONS:
            _flag(flags, "dangerous_attachment", f"Macro-enabled Office document: {filename}")
            score += 25
        elif ext in RISKY_CONTAINER_EXTENSIONS:
            _flag(flags, "dangerous_attachment", f"Attachment type often used to deliver phishing pages: {filename}")
            score += 10

    if not known_contact and score:
        score += 5
    score = min(100, score)
    level = "high" if score >= 55 else "medium" if score >= 30 else "low" if score > 0 else "none"
    return RiskAssessment(level=level, flags=flags, score=score)


def merge_flags(rule_flags: list[dict[str, str]], llm_flags: list[dict[str, str]]) -> list[dict[str, str]]:
    merged = list(rule_flags)
    for flag in llm_flags:
        if not any(f["code"] == flag["code"] for f in merged):
            merged.append({"code": flag["code"], "detail": flag["detail"], "source": "llm"})
    return merged[:15]
