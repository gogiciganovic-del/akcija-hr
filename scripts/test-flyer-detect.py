#!/usr/bin/env python3
"""
Test praga flyer_detect_lib (tvrde konstante + mutacija).
Pokreni: npm run test:flyer-detect
         ili: py -3 scripts/test-flyer-detect.py
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scraper"))

from flyer_detect_lib import (  # noqa: E402
    MIN_NEW,
    MIN_RATIO,
    PCT,
    WINDOW_DAYS,
    count_new,
    ratio_new,
    should_fire,
    threshold_for_today,
)


def assert_(cond: bool, msg: str) -> None:
    if not cond:
        raise AssertionError(msg)


# Mutacija: ako se konstanta u libu promijeni, test padne.
assert_(MIN_NEW == 15, f"MIN_NEW={MIN_NEW}")
assert_(PCT == 0.30, f"PCT={PCT}")
assert_(MIN_RATIO == 0.50, f"MIN_RATIO={MIN_RATIO}")
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
assert_(abs(ratio_new(100, 40) - 0.4) < 1e-9, "ratio 40%")
assert_(abs(ratio_new(100, 51) - 0.51) < 1e-9, "ratio 51%")

# 40/100 = 40% — prolazi max(15,30%) ali pada na omjeru >50%
skip_ratio, r_ratio = should_fire(today_n=100, prev_n=50, new_n=40)
assert_(skip_ratio is False and "below_ratio" in r_ratio, r_ratio)

# 51/100 = 51% — prolazi prag i omjer
fire, reason = should_fire(today_n=100, prev_n=50, new_n=51)
assert_(fire is True, f"should fire: {reason}")
assert_("ok:" in reason, reason)

# 40/50 = 80% — dovoljan omjer i thr=15
fire2, reason2 = should_fire(today_n=50, prev_n=40, new_n=40)
assert_(fire2 is True, f"should fire high ratio: {reason2}")

# točno 50% — strogo > 50%, ne pali
skip_eq, r_eq = should_fire(today_n=100, prev_n=50, new_n=50)
assert_(skip_eq is False and "below_ratio" in r_eq, r_eq)

skip_empty, r1 = should_fire(today_n=100, prev_n=0, new_n=100)
assert_(skip_empty is False and "prev_empty" in r1, r1)

skip_thr, r2 = should_fire(today_n=100, prev_n=50, new_n=10)
assert_(skip_thr is False and "below_threshold" in r2, r2)

skip_week, r3 = should_fire(
    today_n=100, prev_n=50, new_n=51, week_already_fired=True
)
assert_(skip_week is False and "week_dedup" in r3, r3)

print("OK flyer-detect")
