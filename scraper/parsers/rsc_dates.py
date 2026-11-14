"""
RSC / flight validFrom·validTo iz NajCijena listing HTML-a.

Napomena: postojeći korisnici/deals u bazi i dalje mogu imati sintetski now+7
dok se ne re-scrapeaju. Ovaj modul samo parsira listing.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


def _load_zagreb_tz() -> ZoneInfo:
    try:
        return ZoneInfo("Europe/Zagreb")
    except ZoneInfoNotFoundError as e:
        # Windows / slim Python često nema IANA TZDB — `pip install tzdata`.
        raise RuntimeError(
            "Nedostaje IANA tzdata za Europe/Zagreb. "
            "Instaliraj: py -3 -m pip install tzdata"
        ) from e


TZ_ZAGREB = _load_zagreb_tz()

# Isti oblik kao scripts/proto_rsc_dates.py — id → validFrom → validTo u istom objektu.
_ITEM_ESCAPED = re.compile(
    r'\\"id\\":(\d+),'
    r'((?:(?!\\"id\\":).){0,1600}?)'
    r'\\"validFrom\\":\\"(\d{4}-\d{2}-\d{2})\\"'
    r'(?:(?!\\"id\\":).){0,200}?'
    r'\\"validTo\\":\\"(\d{4}-\d{2}-\d{2})\\"',
    re.DOTALL,
)
_ITEM_RAW = re.compile(
    r'"id":(\d+),'
    r'((?:(?!"id":).){0,1600}?)'
    r'"validFrom":"(\d{4}-\d{2}-\d{2})"'
    r'(?:(?!"id":).){0,200}?'
    r'"validTo":"(\d{4}-\d{2}-\d{2})"',
    re.DOTALL,
)

_YMD_RE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})$")

# Trajanje duže od ovoga → fallback na now / now+7.
MAX_SPAN_DAYS = 60


def parse_ymd(raw: str | None) -> date | None:
    s = str(raw or "").strip()
    m = _YMD_RE.match(s)
    if not m:
        return None
    y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
    try:
        return date(y, mo, d)
    except ValueError:
        return None


def zagreb_day_start(d: date) -> datetime:
    """Početak kalendarskog dana u Europe/Zagreb (DST-aware)."""
    return datetime(d.year, d.month, d.day, 0, 0, 0, tzinfo=TZ_ZAGREB)


def zagreb_day_end(d: date) -> datetime:
    """Kraj kalendarskog dana 23:59:59 u Europe/Zagreb (DST-aware)."""
    return datetime(d.year, d.month, d.day, 23, 59, 59, tzinfo=TZ_ZAGREB)


def parse_rsc_dates(html: str) -> dict[str, tuple[date, date]]:
    """external_id → (validFrom, validTo) iz RSC payloada."""
    found: dict[str, tuple[date, date]] = {}
    for rx in (_ITEM_ESCAPED, _ITEM_RAW):
        for m in rx.finditer(html or ""):
            ext = m.group(1)
            if ext in found:
                continue
            vf = parse_ymd(m.group(3))
            vt = parse_ymd(m.group(4))
            if vf is None or vt is None:
                continue
            found[ext] = (vf, vt)
    return found


@dataclass(frozen=True)
class ValidityResolution:
    """Rezultat odluke za jednu akciju."""

    valid_from: datetime
    valid_until: datetime
    source: str  # "rsc" | "fallback"
    skip: bool = False  # True = ne ubacuj (istekla)
    skip_reason: str | None = None
    span_days: int | None = None


def fallback_window(now: datetime | None = None) -> tuple[datetime, datetime]:
    n = now or datetime.now(timezone.utc)
    if n.tzinfo is None:
        n = n.replace(tzinfo=timezone.utc)
    return n, n + timedelta(days=7)


def resolve_validity(
    valid_from_d: date | None,
    valid_to_d: date | None,
    *,
    now: datetime | None = None,
) -> ValidityResolution:
    """
    RSC datumi → aware datetimes u Zagreb zoni.
    Nevaljani / predugi span → fallback now/now+7.
    Ako je kraj validTo dana već prošao → skip (ne aktivna).
    """
    n = now or datetime.now(timezone.utc)
    if n.tzinfo is None:
        n = n.replace(tzinfo=timezone.utc)

    if valid_from_d is None or valid_to_d is None:
        vf, vu = fallback_window(n)
        return ValidityResolution(vf, vu, "fallback", span_days=7)

    if valid_to_d < valid_from_d:
        vf, vu = fallback_window(n)
        return ValidityResolution(vf, vu, "fallback", span_days=7)

    span = (valid_to_d - valid_from_d).days
    if span > MAX_SPAN_DAYS:
        vf, vu = fallback_window(n)
        return ValidityResolution(vf, vu, "fallback", span_days=7)

    start = zagreb_day_start(valid_from_d)
    end = zagreb_day_end(valid_to_d)
    if end < n:
        # Ne ubacuj kao aktivnu — listing bi inače držao mrtve akcije do +7.
        return ValidityResolution(
            start,
            end,
            "rsc",
            skip=True,
            skip_reason="expired",
            span_days=span,
        )

    return ValidityResolution(start, end, "rsc", span_days=span)
