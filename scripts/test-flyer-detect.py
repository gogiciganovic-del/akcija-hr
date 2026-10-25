#!/usr/bin/env python3
"""
Test praga flyer_detect_lib (tvrde konstante + mutacija).
Pokreni: npm run test:flyer-detect
         ili: python scripts/test-flyer-detect.py
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scraper"))

from flyer_detect_lib import (  # noqa: E402
    MIN_NEW,
    PCT,
    WINDOW_DAYS,
    count_new,
    should_fire,
    threshold_for_today,
)


def assert_(cond: bool, msg: str) -> None:
    if not cond:
        raise AssertionError(msg)


# Mutacija: ako se konstanta u libu promijeni, test padne.
assert_(MIN_NEW == 15, f"MIN_NEW={MIN_NEW}")
assert_(PCT == 0.30, f"PCT={PCT}")
assert_(WINDOW_DAYS == 8, f"WINDOW_DAYS={WINDOW_DAYS}")

assert_(threshold_for_today(0) == 15, "floor 15")
assert_(threshold_for_today(40) == 15, "40 → max(15,12)=15")
assert_(threshold_for_today(50) == 15, "50 → max(15,15)=15")
assert_(threshold_for_today(100) == 30, "100 → 30")
assert_(threshold_for_today(149) == 45, "149 → ceil(44.7)=45")

today = {"a", "b", "c", "d"}
prev = {"a", "b", "x"}
assert_(count_new(today, prev) == 2, "new count")
assert_(count_new(today, set()) == 4, "all new vs empty prev set")

fire, reason = should_fire(today_n=100, prev_n=50, new_n=40)
assert_(fire is True, f"should fire: {reason}")
assert_("ok:" in reason, reason)

skip_empty, r1 = should_fire(today_n=100, prev_n=0, new_n=100)
assert_(skip_empty is False and "prev_empty" in r1, r1)

skip_thr, r2 = should_fire(today_n=100, prev_n=50, new_n=10)
assert_(skip_thr is False and "below_threshold" in r2, r2)

skip_week, r3 = should_fire(
    today_n=100, prev_n=50, new_n=40, week_already_fired=True
)
assert_(skip_week is False and "week_dedup" in r3, r3)

print("OK flyer-detect")
