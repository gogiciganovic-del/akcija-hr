#!/usr/bin/env python3
"""
Unit testovi za RSC deal datume (Zagreb start/end, fallback, expired).
Pokreni: py -3 scripts/test_rsc_deal_dates.py
"""
from __future__ import annotations

import sys
from datetime import date, datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scraper"))

from parsers.rsc_dates import (  # noqa: E402
    MAX_SPAN_DAYS,
    parse_ymd,
    resolve_validity,
    zagreb_day_end,
    zagreb_day_start,
)

TZ = ZoneInfo("Europe/Zagreb")


def assert_eq(a, b, msg=""):
    if a != b:
        raise AssertionError(f"{msg}: {a!r} != {b!r}")


def test_parse_ymd():
    assert_eq(parse_ymd("2026-03-29"), date(2026, 3, 29))
    assert_eq(parse_ymd(None), None)
    assert_eq(parse_ymd(""), None)
    assert_eq(parse_ymd("2026-02-30"), None)
    assert_eq(parse_ymd("bad"), None)


def test_month_end():
    d = date(2026, 1, 31)
    start = zagreb_day_start(d)
    end = zagreb_day_end(d)
    assert_eq(start.tzinfo, TZ)
    assert_eq(start.hour, 0)
    assert_eq(end.hour, 23)
    assert_eq(end.minute, 59)
    assert_eq(end.second, 59)
    assert_eq(start.day, 31)
    assert_eq(end.day, 31)


def test_dst_spring_2026_03_29():
    # EU DST: 2026-03-29 02:00 → 03:00 u Zagrebu
    d = date(2026, 3, 29)
    start = zagreb_day_start(d)
    end = zagreb_day_end(d)
    assert_eq(start.utcoffset().total_seconds(), 3600)  # CET UTC+1
    assert_eq(end.utcoffset().total_seconds(), 7200)  # CEST UTC+2
    # Cijeli lokalni dan postoji
    assert start < end
    assert_eq((end - start).total_seconds(), 23 * 3600 + 59 * 60 + 59)


def test_dst_fall_2026_10_25():
    # EU DST end: 2026-10-25 03:00 → 02:00
    d = date(2026, 10, 25)
    start = zagreb_day_start(d)
    end = zagreb_day_end(d)
    assert_eq(start.utcoffset().total_seconds(), 7200)  # CEST
    assert_eq(end.utcoffset().total_seconds(), 3600)  # CET
    assert start < end


def test_missing_dates_fallback():
    now = datetime(2026, 11, 14, 12, 0, tzinfo=timezone.utc)
    r = resolve_validity(None, None, now=now)
    assert_eq(r.source, "fallback")
    assert_eq(r.skip, False)
    assert_eq((r.valid_until - r.valid_from).days, 7)


def test_invalid_order_fallback():
    now = datetime(2026, 11, 14, 12, 0, tzinfo=timezone.utc)
    r = resolve_validity(date(2026, 11, 10), date(2026, 11, 1), now=now)
    assert_eq(r.source, "fallback")


def test_too_long_span_fallback():
    now = datetime(2026, 11, 14, 12, 0, tzinfo=timezone.utc)
    r = resolve_validity(
        date(2026, 9, 1),
        date(2026, 9, 1) + __import__("datetime").timedelta(days=MAX_SPAN_DAYS + 1),
        now=now,
    )
    assert_eq(r.source, "fallback")


def test_expired_skipped():
    now = datetime(2026, 11, 14, 12, 0, tzinfo=timezone.utc)
    r = resolve_validity(date(2026, 11, 1), date(2026, 11, 10), now=now)
    assert_eq(r.source, "rsc")
    assert_eq(r.skip, True)
    assert_eq(r.skip_reason, "expired")


def test_rsc_ok_last_day_still_valid():
    # validTo = 2026-11-14 → kraj dana još traje u podne Zagreba
    now = datetime(2026, 11, 14, 11, 0, tzinfo=timezone.utc)  # 12:00 Zagreb winter
    r = resolve_validity(date(2026, 11, 10), date(2026, 11, 14), now=now)
    assert_eq(r.skip, False)
    assert_eq(r.source, "rsc")
    assert_eq(r.valid_from, zagreb_day_start(date(2026, 11, 10)))
    assert_eq(r.valid_until, zagreb_day_end(date(2026, 11, 14)))


def main() -> int:
    test_parse_ymd()
    test_month_end()
    test_dst_spring_2026_03_29()
    test_dst_fall_2026_10_25()
    test_missing_dates_fallback()
    test_invalid_order_fallback()
    test_too_long_span_fallback()
    test_expired_skipped()
    test_rsc_ok_last_day_still_valid()
    print("OK test_rsc_deal_dates")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
