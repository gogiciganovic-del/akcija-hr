#!/usr/bin/env python3
"""Unit tests for last-seen deactivate guard (no DB, no network)."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scraper"))

from deactivate_stale import (  # noqa: E402
    count_stale_active,
    guard_allows_deactivate,
    listing_complete,
    plan_chain_deactivation,
)


def assert_true(cond: bool, msg: str) -> None:
    if not cond:
        raise AssertionError(msg)


def main() -> int:
    # Truncated: full last page at max_pages
    assert_true(
        listing_complete(
            pages_fetched=3, last_page_cards=50, max_pages=3, hit_empty_page=False
        )
        is False,
        "3 full pages at max_pages=3 → truncated",
    )
    # Complete: last page short
    assert_true(
        listing_complete(
            pages_fetched=2, last_page_cards=12, max_pages=3, hit_empty_page=False
        )
        is True,
        "short last page → complete",
    )
    # Complete: empty page
    assert_true(
        listing_complete(
            pages_fetched=4, last_page_cards=0, max_pages=12, hit_empty_page=True
        )
        is True,
        "empty page → complete",
    )

    # Truncated fetch → guard_ok=false reason truncated
    trunc = plan_chain_deactivation(
        chain="Lidl",
        seen=150,
        previous_active=150,
        stale_active_count=0,
        fetch_ok=True,
        pages_fetched=3,
        last_page_cards=50,
        complete=False,
    )
    assert_true(trunc.guard_ok is False, "truncated guard_ok")
    assert_true(trunc.reason == "truncated", f"reason got {trunc.reason}")
    assert_true(trunc.would_deactivate == 0, "truncated must not deactivate")
    assert_true("complete=false" in trunc.summary_line(), trunc.summary_line())
    print(trunc.summary_line())

    # Complete + 100% seen → guard_ok=true
    ok = plan_chain_deactivation(
        chain="Kaufland",
        seen=100,
        previous_active=100,
        stale_active_count=0,
        fetch_ok=True,
        pages_fetched=2,
        last_page_cards=40,
        complete=True,
    )
    assert_true(ok.guard_ok is True, "complete 100% guard_ok")
    assert_true(ok.reason is None, f"ok reason {ok.reason}")
    assert_true(ok.would_deactivate == 0, "no stale")
    assert_true("complete=true" in ok.summary_line(), ok.summary_line())
    print(ok.summary_line())

    # seen=0 never
    zero = plan_chain_deactivation(
        chain="Studenac",
        seen=0,
        previous_active=300,
        stale_active_count=300,
        fetch_ok=True,
        pages_fetched=1,
        last_page_cards=0,
        complete=True,
    )
    assert_true(zero.guard_ok is False, "seen=0 guard")
    assert_true(zero.reason == "seen=0", f"seen=0 reason {zero.reason}")
    assert_true(zero.would_deactivate == 0, "seen=0 would_deactivate")
    print(zero.summary_line())

    # Direct guard helper
    g_ok, g_reason = guard_allows_deactivate(
        seen=150, previous_active=150, fetch_ok=True, complete=False
    )
    assert_true(g_ok is False and g_reason == "truncated", "helper truncated")
    g_ok2, g_reason2 = guard_allows_deactivate(
        seen=0, previous_active=10, fetch_ok=True, complete=True
    )
    assert_true(g_ok2 is False and g_reason2 == "seen=0", "helper seen=0")

    # Fresh rows not counted as stale
    stale = count_stale_active(
        active_product_ids=["a", "b", "c"],
        seen_product_ids={"a", "b", "c"},
    )
    assert_true(stale == 0, "all seen → no stale")

    print("OK test-deactivate-stale")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
