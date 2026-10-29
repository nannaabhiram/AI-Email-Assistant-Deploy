"""Timezone helpers shared by settings and the briefing scheduler."""

from __future__ import annotations

from datetime import date, datetime, time
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

# Legacy aliases (still emitted by browsers' CLDR data) -> current IANA names. zoneinfo accepts both,
# but storing one spelling keeps settings, UI selection and comparisons consistent.
LEGACY_TIMEZONES = {
    "Asia/Calcutta": "Asia/Kolkata",
    "Asia/Saigon": "Asia/Ho_Chi_Minh",
    "Asia/Katmandu": "Asia/Kathmandu",
    "Asia/Rangoon": "Asia/Yangon",
    "Europe/Kiev": "Europe/Kyiv",
    "America/Godthab": "America/Nuuk",
    "Atlantic/Faeroe": "Atlantic/Faroe",
    "Pacific/Enderbury": "Pacific/Kanton",
    "Pacific/Truk": "Pacific/Chuuk",
    "Pacific/Ponape": "Pacific/Pohnpei",
    "Africa/Asmera": "Africa/Asmara",
    "America/Buenos_Aires": "America/Argentina/Buenos_Aires",
    "America/Catamarca": "America/Argentina/Catamarca",
    "America/Cordoba": "America/Argentina/Cordoba",
    "America/Jujuy": "America/Argentina/Jujuy",
    "America/Mendoza": "America/Argentina/Mendoza",
    "America/Indianapolis": "America/Indiana/Indianapolis",
    "America/Louisville": "America/Kentucky/Louisville",
    "America/Coral_Harbour": "America/Atikokan",
}


def canonical_timezone(name: str) -> str:
    """Validate an IANA timezone and return its current name. Raises ValueError if unknown."""
    name = LEGACY_TIMEZONES.get(name, name)
    try:
        ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError) as exc:
        raise ValueError(f"Unknown timezone {name!r}") from exc
    return name


def safe_zone(name: str | None) -> ZoneInfo:
    try:
        return ZoneInfo(canonical_timezone(name or "UTC"))
    except ValueError:
        return ZoneInfo("UTC")


def briefing_due_date(now: datetime, tz_name: str | None, briefing_time: time | None) -> date | None:
    """The user's local date whose briefing is due at ``now`` (aware), or None if it is not time yet.

    Uses the zone's offset at ``now``, so daylight-saving changes move the UTC run time automatically
    (e.g. 08:00 New York is 13:00 UTC in winter and 12:00 UTC in summer; India stays UTC+05:30).
    """
    local = now.astimezone(safe_zone(tz_name))
    return local.date() if local.time() >= (briefing_time or time(8, 0)) else None
