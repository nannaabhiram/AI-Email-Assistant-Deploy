"""Meeting detection from iCalendar parts and message text."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, datetime

from icalendar import Calendar

CONFERENCE_RE = re.compile(
    r"https://(?:[\w-]+\.)?(?:zoom\.us/[jw]/\S+|meet\.google\.com/[\w-]+|teams\.microsoft\.com/\S+|"
    r"teams\.live\.com/\S+|[\w-]+\.webex\.com/\S+)",
    re.I,
)
MEETING_CUE = re.compile(
    r"\b(meeting|meet|call|sync|catch[- ]up|interview|demo|review session|invitation|invite|calendar|"
    r"stand-?up|webinar)\b",
    re.I,
)


@dataclass(slots=True)
class DetectedMeeting:
    title: str | None
    start_at: datetime | None
    end_at: datetime | None
    timezone: str | None
    location: str | None
    conference_url: str | None
    participants: list[str] = field(default_factory=list)
    agenda: str | None = None
    requested_response: str | None = None
    source: str = "ics"


def _dt(value: object) -> datetime | None:
    if isinstance(value, datetime):
        return value
    if isinstance(value, date):
        return datetime(value.year, value.month, value.day)
    return None


def parse_ics(data: str) -> list[DetectedMeeting]:
    try:
        cal = Calendar.from_ical(data)
    except Exception:  # malformed calendar data from untrusted senders
        return []
    method = str(cal.get("METHOD", "")).upper()
    out: list[DetectedMeeting] = []
    for event in cal.walk("VEVENT"):
        start = _dt(event.decoded("DTSTART")) if event.get("DTSTART") else None
        end = _dt(event.decoded("DTEND")) if event.get("DTEND") else None
        attendees = event.get("ATTENDEE") or []
        if not isinstance(attendees, list):
            attendees = [attendees]
        description = str(event.get("DESCRIPTION", ""))[:1000] or None
        location = str(event.get("LOCATION", ""))[:300] or None
        conf = CONFERENCE_RE.search(f"{location or ''} {description or ''}")
        out.append(
            DetectedMeeting(
                title=str(event.get("SUMMARY", ""))[:200] or None,
                start_at=start,
                end_at=end,
                timezone=str(start.tzinfo) if start and start.tzinfo else None,
                location=location,
                conference_url=conf.group(0) if conf else None,
                participants=[str(a).replace("mailto:", "").replace("MAILTO:", "")[:320] for a in attendees][:30],
                agenda=description,
                requested_response="Accept or decline the invitation" if method == "REQUEST" else None,
                source="ics",
            )
        )
    return out[:5]


def detect_text_meeting(subject: str, body: str) -> DetectedMeeting | None:
    text = f"{subject}\n{body[:6000]}"
    conf = CONFERENCE_RE.search(text)
    if not (conf or MEETING_CUE.search(subject)):
        return None
    return DetectedMeeting(
        title=subject[:200] or None, start_at=None, end_at=None, timezone=None,
        location=None, conference_url=conf.group(0) if conf else None, source="rules",
        requested_response="Confirm attendance" if re.search(r"\b(confirm|rsvp|let me know)\b", text, re.I) else None,
    )
