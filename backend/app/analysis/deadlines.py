"""Deterministic deadline extraction.

Only phrases introduced by a deadline cue ("by", "before", "due", "deadline", "until",
"no later than", "valid for", "within") are treated as deadlines; a date that is merely
mentioned is not. Relative expressions are resolved against the user's timezone.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from dateutil import parser as dateparser

WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
MONTHS = (
    "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|"
    "sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?"
)
TZ_ABBREVIATIONS = {
    "ist": "Asia/Kolkata", "utc": "UTC", "gmt": "UTC", "est": "America/New_York", "edt": "America/New_York",
    "cst": "America/Chicago", "cdt": "America/Chicago", "pst": "America/Los_Angeles",
    "pdt": "America/Los_Angeles", "cet": "Europe/Berlin", "cest": "Europe/Berlin", "bst": "Europe/London",
    "sgt": "Asia/Singapore", "jst": "Asia/Tokyo", "aest": "Australia/Sydney",
}
CUE = r"(?:by|before|due(?:\s+(?:on|by|date))?|deadline(?:\s+is)?:?|until|till|no later than|not later than|latest by|on or before)"
TIME = r"(?:\s*(?:at|@)?\s*(?P<time>\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)|\d{1,2}:\d{2}|noon|midnight|eod|cob|end of (?:the )?day))?"
TZ = r"(?:\s*(?P<tz>ist|utc|gmt|est|edt|cst|cdt|pst|pdt|cet|cest|bst|sgt|jst|aest))?"

_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("iso", re.compile(rf"\b{CUE}\s+(?:the\s+)?(?P<date>\d{{4}}-\d{{2}}-\d{{2}}){TIME}{TZ}", re.I)),
    ("dmy", re.compile(rf"\b{CUE}\s+(?:the\s+)?(?P<date>\d{{1,2}}(?:st|nd|rd|th)?\s+(?:of\s+)?(?:{MONTHS})\.?(?:,?\s+\d{{4}})?){TIME}{TZ}", re.I)),
    ("mdy", re.compile(rf"\b{CUE}\s+(?:the\s+)?(?P<date>(?:{MONTHS})\.?\s+\d{{1,2}}(?:st|nd|rd|th)?(?:,?\s+\d{{4}})?){TIME}{TZ}", re.I)),
    ("numeric", re.compile(rf"\b{CUE}\s+(?P<date>\d{{1,2}}[/.]\d{{1,2}}[/.]\d{{2,4}}){TIME}{TZ}", re.I)),
    ("weekday", re.compile(rf"\b{CUE}\s+(?:this\s+|next\s+)?(?P<weekday>{'|'.join(WEEKDAYS)}){TIME}{TZ}", re.I)),
    ("relday", re.compile(rf"\b{CUE}\s+(?P<rel>today|tonight|tomorrow|end of (?:the )?(?:day|week|month)|eod|cob|eow){TIME}{TZ}", re.I)),
    ("time_today", re.compile(rf"\b{CUE}\s+(?P<time>\d{{1,2}}(?::\d{{2}})?\s*(?:a\.?m\.?|p\.?m\.?))\s*(?P<rel>today|tonight|tomorrow)?{TZ}", re.I)),
    ("within", re.compile(r"\b(?:within|in the next|valid for|validity of)\s+(?P<n>\d{1,3})\s+(?P<unit>hours?|days?|business days?|working days?|weeks?)", re.I)),
]


@dataclass(slots=True)
class DeadlineCandidate:
    text: str
    due_at: datetime
    timezone: str
    date_type: str  # explicit | inferred
    start: int


def _zone(name: str | None, default: str) -> ZoneInfo:
    try:
        return ZoneInfo(name or default)
    except (ZoneInfoNotFoundError, ValueError):
        return ZoneInfo("UTC")


def _parse_time(raw: str | None) -> time | None:
    if not raw:
        return None
    raw = raw.lower().replace(".", "").strip()
    if raw in {"eod", "cob", "end of day", "end of the day"}:
        return time(17, 0)
    if raw == "noon":
        return time(12, 0)
    if raw == "midnight":
        return time(23, 59)
    match = re.match(r"(\d{1,2})(?::(\d{2}))?\s*(am|pm)?", raw)
    if not match:
        return None
    hour, minute, ampm = int(match.group(1)), int(match.group(2) or 0), match.group(3)
    if ampm == "pm" and hour < 12:
        hour += 12
    if ampm == "am" and hour == 12:
        hour = 0
    if hour > 23 or minute > 59:
        return None
    return time(hour, minute)


def _next_weekday(today: date, weekday: int, force_next: bool) -> date:
    delta = (weekday - today.weekday()) % 7
    if force_next and delta == 0:
        delta = 7
    return today + timedelta(days=delta)


def extract_deadlines(text: str, now: datetime, user_timezone: str = "UTC") -> list[DeadlineCandidate]:
    """Return deadline candidates found in ``text`` (resolved, timezone-aware), ordered by position."""
    out: list[DeadlineCandidate] = []
    seen_spans: list[tuple[int, int]] = []
    sample = text[:20000]
    for kind, pattern in _PATTERNS:
        for m in pattern.finditer(sample):
            if any(s <= m.start() < e for s, e in seen_spans):
                continue
            groups = m.groupdict()
            tz_name = TZ_ABBREVIATIONS.get((groups.get("tz") or "").lower()) or user_timezone
            zone = _zone(tz_name, user_timezone)
            local_now = now.astimezone(zone)
            t = _parse_time(groups.get("time"))
            date_type = "explicit"
            due_date: date | None = None
            try:
                if kind in {"iso", "dmy", "mdy", "numeric"}:
                    parsed = dateparser.parse(
                        re.sub(r"(\d)(st|nd|rd|th)", r"\1", groups["date"]).replace(" of ", " "),
                        dayfirst=kind in {"dmy", "numeric"},
                        default=datetime(local_now.year, 1, 1),
                    )
                    due_date = parsed.date()
                    if kind in {"dmy", "mdy"} and not re.search(r"\d{4}", groups["date"]) and due_date < local_now.date() - timedelta(days=30):
                        due_date = due_date.replace(year=due_date.year + 1)
                elif kind == "weekday":
                    force_next = "next" in m.group(0).lower()
                    due_date = _next_weekday(local_now.date(), WEEKDAYS.index(groups["weekday"].lower()), force_next)
                elif kind in {"relday", "time_today"}:
                    rel = (groups.get("rel") or "today").lower()
                    if rel in {"tomorrow"}:
                        due_date = local_now.date() + timedelta(days=1)
                    elif rel.startswith("end of") and "week" in rel or rel == "eow":
                        due_date = _next_weekday(local_now.date(), 4, False)
                        t = t or time(17, 0)
                    elif rel.startswith("end of") and "month" in rel:
                        nxt = (local_now.replace(day=28) + timedelta(days=4)).date()
                        due_date = nxt - timedelta(days=nxt.day)
                        t = t or time(17, 0)
                    else:
                        due_date = local_now.date()
                        if rel in {"eod", "cob"} or "day" in rel:
                            t = t or time(17, 0)
                        if rel == "tonight":
                            t = t or time(21, 0)
                elif kind == "within":
                    n = int(groups["n"])
                    unit = groups["unit"].lower()
                    date_type = "inferred"
                    if unit.startswith("hour"):
                        due = local_now + timedelta(hours=n)
                        out.append(DeadlineCandidate(m.group(0).strip(), due, str(zone), date_type, m.start()))
                        seen_spans.append((m.start(), m.end()))
                        continue
                    days = n * 7 if unit.startswith("week") else n
                    if "business" in unit or "working" in unit:
                        d, added = local_now.date(), 0
                        while added < n:
                            d += timedelta(days=1)
                            if d.weekday() < 5:
                                added += 1
                        due_date = d
                    else:
                        due_date = local_now.date() + timedelta(days=days)
                    t = t or time(23, 59)
            except (ValueError, OverflowError):
                continue
            if due_date is None:
                continue
            due = datetime.combine(due_date, t or time(23, 59), tzinfo=zone)
            out.append(DeadlineCandidate(m.group(0).strip()[:200], due, str(zone), date_type, m.start()))
            seen_spans.append((m.start(), m.end()))
    out.sort(key=lambda c: c.start)
    return out


def primary_deadline(candidates: list[DeadlineCandidate], now: datetime) -> DeadlineCandidate | None:
    """Earliest deadline that is not far in the past (explicit preferred over inferred)."""
    valid = [c for c in candidates if c.due_at >= now - timedelta(days=1)]
    if not valid:
        return None
    explicit = [c for c in valid if c.date_type == "explicit"]
    return min(explicit or valid, key=lambda c: c.due_at)


def parse_iso_datetime(value: str | None, user_timezone: str) -> datetime | None:
    """Parse an ISO string from the LLM; naive values are interpreted in the user's timezone."""
    if not value:
        return None
    try:
        dt = dateparser.isoparse(value)
    except (ValueError, OverflowError):
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=_zone(user_timezone, "UTC"))
    if not (2000 <= dt.year <= 2100):
        return None
    return dt
