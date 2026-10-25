"""
Čista logika detekcije „novi letak” (bez I/O).
Prag: novih >= max(MIN_NEW, ceil(PCT * today_n))
  I  new/today > MIN_RATIO (50%);
prev prozor WINDOW_DAYS; prev prazan → ne pali; week dedup.
Faza 1 kandidati (pon): Eurospin, Kaufland, Plodine — filtriranje lanaca
je u calleru, ne ovdje.
"""

from __future__ import annotations

import math
from datetime import date, datetime, timedelta, timezone

# Tvrde konstante — test mutira očekivanje ako se promijene.
MIN_NEW = 15
PCT = 0.30
MIN_RATIO = 0.50  # new/today mora biti strogo > 50%
WINDOW_DAYS = 8


def threshold_for_today(today_n: int) -> int:
    if today_n < 0:
        raise ValueError("today_n must be >= 0")
    return max(MIN_NEW, math.ceil(PCT * today_n))


def count_new(today_ids: set[str], prev_ids: set[str]) -> int:
    return sum(1 for pid in today_ids if pid not in prev_ids)


def ratio_new(today_n: int, new_n: int) -> float:
    if today_n <= 0:
        return 0.0
    return new_n / today_n


def should_fire(
    *,
    today_n: int,
    prev_n: int,
    new_n: int,
    week_already_fired: bool = False,
) -> tuple[bool, str]:
    """
    Vrati (fire, reason).
    prev_n == 0 → skip (prazan prozor / gap u scrapeu).
    """
    if prev_n <= 0:
        return False, "skip: prev_empty"
    thr = threshold_for_today(today_n)
    if new_n < thr:
        return False, f"skip: below_threshold new={new_n} thr={thr}"
    ratio = ratio_new(today_n, new_n)
    if ratio <= MIN_RATIO:
        return False, (
            f"skip: below_ratio new={new_n} today={today_n} "
            f"ratio={ratio:.3f} min={MIN_RATIO}"
        )
    if week_already_fired:
        return False, "skip: week_dedup"
    return True, (
        f"ok: new={new_n} thr={thr} today={today_n} prev={prev_n} "
        f"ratio={ratio:.3f}"
    )


def utc_day(dt: datetime | date | str) -> date:
    if isinstance(dt, date) and not isinstance(dt, datetime):
        return dt
    if isinstance(dt, str):
        raw = dt.strip().replace("Z", "+00:00")
        dt = datetime.fromisoformat(raw)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).date()


def iso_week_key(d: date) -> str:
    iso = d.isocalendar()
    return f"{iso.year}-W{iso.week:02d}"


def prev_window_days(day: date, window_days: int = WINDOW_DAYS) -> list[date]:
    return [day - timedelta(days=i) for i in range(1, window_days + 1)]
