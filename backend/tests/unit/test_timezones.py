from datetime import UTC, date, datetime, time

import pytest

from app.services.timezones import briefing_due_date, canonical_timezone


def test_legacy_aliases_are_stored_as_current_iana_names() -> None:
    assert canonical_timezone("Asia/Calcutta") == "Asia/Kolkata"
    assert canonical_timezone("Asia/Kolkata") == "Asia/Kolkata"
    assert canonical_timezone("Europe/Kiev") == "Europe/Kyiv"
    assert canonical_timezone("UTC") == "UTC"
    with pytest.raises(ValueError):
        canonical_timezone("India/Standard")


@pytest.mark.parametrize("month", [1, 7])  # India has no daylight saving: same UTC time all year
def test_kolkata_0800_briefing_is_due_at_0230_utc(month: int) -> None:
    eight = time(8, 0)
    assert briefing_due_date(datetime(2027, month, 15, 2, 29, tzinfo=UTC), "Asia/Kolkata", eight) is None
    assert briefing_due_date(datetime(2027, month, 15, 2, 30, tzinfo=UTC), "Asia/Kolkata", eight) == date(2027, month, 15)


def test_local_date_not_utc_date_is_used() -> None:
    # 20:00 UTC on the 14th is already 01:30 on the 15th in India: not yet 08:00 there.
    assert briefing_due_date(datetime(2027, 1, 14, 20, 0, tzinfo=UTC), "Asia/Kolkata", time(8, 0)) is None
    assert briefing_due_date(datetime(2027, 1, 14, 20, 0, tzinfo=UTC), "Asia/Kolkata", time(1, 0)) == date(2027, 1, 15)


def test_daylight_saving_zone_follows_its_current_offset() -> None:
    ny = "America/New_York"
    assert briefing_due_date(datetime(2027, 1, 15, 12, 59, tzinfo=UTC), ny, time(8, 0)) is None  # EST, UTC-5
    assert briefing_due_date(datetime(2027, 1, 15, 13, 0, tzinfo=UTC), ny, time(8, 0)) == date(2027, 1, 15)
    assert briefing_due_date(datetime(2027, 7, 15, 12, 0, tzinfo=UTC), ny, time(8, 0)) == date(2027, 7, 15)  # EDT, UTC-4


def test_unknown_or_missing_zone_falls_back_to_utc() -> None:
    assert briefing_due_date(datetime(2027, 1, 15, 8, 0, tzinfo=UTC), "Mars/Base", time(8, 0)) == date(2027, 1, 15)
    assert briefing_due_date(datetime(2027, 1, 15, 7, 59, tzinfo=UTC), None, None) is None
