#!/usr/bin/env python3
"""Unit + regression tests for last-seen deactivate / fetch_store stop rule."""
from __future__ import annotations

import sys
import time
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scraper"))

from deactivate_stale import (  # noqa: E402
    guard_allows_deactivate,
    listing_complete,
    plan_chain_deactivation,
)
from scraper import fetch_store  # noqa: E402


def assert_true(cond: bool, msg: str) -> None:
    if not cond:
        raise AssertionError(msg)


def _card_html(ext_id: str, name: str = "Proizvod") -> str:
    return (
        f'<a class="product-card" href="/akcija/{name.lower().replace(" ", "-")}-{ext_id}">'
        f'<div class="product-card__thumb"><img alt="{name} - Akcija" src="https://x/{ext_id}.jpg"></div>'
        f'<span class="text-price">1,99</span>'
        f'<span class="regular-price">2,99</span>'
        f"</a>"
    )


def _page_html(n_cards: int, id_start: int) -> str:
    cards = "".join(
        _card_html(str(id_start + i), name=f"Item {id_start + i}")
        for i in range(n_cards)
    )
    return f"<html><body>{cards}</body></html>"


class FakeResp:
    def __init__(self, text: str, status_code: int = 200):
        self.text = text
        self.status_code = status_code

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


class FakeClient:
    """Returns successive pages by page= query; tracks request count."""

    def __init__(self, pages: list[str]):
        self.pages = pages
        self.requests = 0
        self.urls: list[str] = []

    def get(self, url: str, **_kwargs):
        self.requests += 1
        self.urls.append(url)
        # page number from query; default 1
        page = 1
        if "page=" in url:
            try:
                page = int(url.split("page=")[1].split("&")[0])
            except ValueError:
                page = 1
        idx = page - 1
        if idx < 0 or idx >= len(self.pages):
            return FakeResp("<html><body></body></html>")
        return FakeResp(self.pages[idx])


def old_fetch_store_reference(client, store_slug, max_pages):
    """
    Exact pre-regression loop from git history (7237418): stop on len(new)==0.
    Returns (external_ids, request_count).
    """
    from config import CHAIN_NAMES
    from parser import parse_listing_page

    chain = CHAIN_NAMES[store_slug]
    all_deals = []
    seen = set()
    use_vendor = False
    requests_before = client.requests

    for page in range(1, max_pages + 1):
        if use_vendor:
            url = f"https://najcijena.hr/?vendor={store_slug}&page={page}"
        else:
            url = f"https://najcijena.hr/trgovina/{store_slug}?page={page}"
        resp = client.get(url)
        batch = parse_listing_page(resp.text, chain)

        if page == 1 and len(batch) == 0 and not use_vendor:
            use_vendor = True
            url = f"https://najcijena.hr/?vendor={store_slug}&page={page}"
            resp = client.get(url)
            batch = parse_listing_page(resp.text, chain)

        new = [d for d in batch if d.external_id not in seen]
        for d in new:
            seen.add(d.external_id)
        all_deals.extend(new)

        if len(new) == 0:
            break
        # sleep skipped in reference for speed; fetch_store sleeps — we patch it

    return [d.external_id for d in all_deals], client.requests - requests_before


def main() -> int:
    # --- listing_complete ---
    assert_true(
        listing_complete(fetch_ok=True, stopped_naturally=True) is True,
        "natural end → complete",
    )
    assert_true(
        listing_complete(fetch_ok=True, stopped_naturally=False) is False,
        "max_pages exhaust → truncated",
    )
    assert_true(
        listing_complete(fetch_ok=False, stopped_naturally=True) is False,
        "fetch_ok=false → not complete",
    )

    # Truncated plan
    trunc = plan_chain_deactivation(
        chain="Lidl",
        seen=150,
        visible_before=150,
        visible_not_seen=0,
        fetch_ok=True,
        pages_fetched=3,
        last_page_cards=46,
        complete=False,
    )
    assert_true(trunc.guard_ok is False and trunc.reason == "truncated", "truncated")
    print(trunc.summary_line())

    # Complete + 100% seen
    ok = plan_chain_deactivation(
        chain="Kaufland",
        seen=100,
        visible_before=100,
        visible_not_seen=0,
        fetch_ok=True,
        pages_fetched=3,
        last_page_cards=20,
        complete=True,
    )
    assert_true(ok.guard_ok is True and ok.reason is None, "complete 100%")
    print(ok.summary_line())

    # seen=0 never
    zero = plan_chain_deactivation(
        chain="Studenac",
        seen=0,
        visible_before=300,
        visible_not_seen=300,
        fetch_ok=True,
        pages_fetched=1,
        last_page_cards=0,
        complete=True,
    )
    assert_true(zero.guard_ok is False and zero.reason == "seen=0", "seen=0")
    assert_true(zero.would_deactivate == 0, "seen=0 no deactivate")
    print(zero.summary_line())

    g_ok, g_reason = guard_allows_deactivate(
        seen=150, visible_before=150, fetch_ok=True, complete=False
    )
    assert_true(g_ok is False and g_reason == "truncated", "helper truncated")

    # --- Regression: pages 46,46,30,0 must match old stop rule ---
    pages = [
        _page_html(46, 1000),
        _page_html(46, 2000),
        _page_html(30, 3000),
        _page_html(0, 4000),
    ]
    # Old reference
    client_old = FakeClient(pages)
    with patch("scraper.BASE_URL", "https://najcijena.hr"):
        # reference uses hard-coded najcijena URLs matching FakeClient
        old_ids, old_reqs = old_fetch_store_reference(client_old, "lidl", max_pages=10)

    client_new = FakeClient(pages)
    with patch("scraper.time.sleep", lambda _s: None):
        with patch("scraper.BASE_URL", "https://najcijena.hr"):
            # fetch_store uses get_with_retry which calls client.get
            result = fetch_store(client_new, "lidl", max_pages=10)

    new_ids = [d.external_id for d in result.deals]
    assert_true(
        new_ids == old_ids,
        f"deal ids mismatch old={len(old_ids)} new={len(new_ids)}",
    )
    assert_true(
        client_new.requests == old_reqs,
        f"request count old={old_reqs} new={client_new.requests}",
    )
    # 46+46+30 then empty page → 4 requests, complete
    assert_true(client_new.requests == 4, f"expected 4 requests got {client_new.requests}")
    assert_true(len(new_ids) == 46 + 46 + 30, f"expected 122 deals got {len(new_ids)}")
    assert_true(result.complete is True, "natural empty page → complete")
    assert_true(result.fetch_ok is True, "fetch_ok")
    print(
        f"regression OK: deals={len(new_ids)} requests={client_new.requests} "
        f"complete={result.complete}"
    )

    # Page with 46 cards must NOT stop fetch (continue to next page)
    pages_46 = [_page_html(46, 5000), _page_html(10, 6000), _page_html(0, 7000)]
    client_46 = FakeClient(pages_46)
    with patch("scraper.time.sleep", lambda _s: None):
        with patch("scraper.BASE_URL", "https://najcijena.hr"):
            r46 = fetch_store(client_46, "kaufland", max_pages=5)
    assert_true(
        len(r46.deals) == 56,
        f"46-card page must not stop early, got {len(r46.deals)}",
    )
    assert_true(client_46.requests == 3, f"expected 3 pages got {client_46.requests}")
    assert_true(r46.complete is True, "ended on empty → complete")
    print("46-card page does not stop fetch: OK")

    # Truncated when max_pages exhausted with still-new deals
    pages_trunc = [_page_html(46, 8000), _page_html(46, 9000), _page_html(46, 10000)]
    client_t = FakeClient(pages_trunc)
    with patch("scraper.time.sleep", lambda _s: None):
        with patch("scraper.BASE_URL", "https://najcijena.hr"):
            rt = fetch_store(client_t, "spar", max_pages=3)
    assert_true(rt.complete is False, "exhausted max_pages → truncated")
    assert_true(len(rt.deals) == 138, f"got {len(rt.deals)}")
    assert_true(client_t.requests == 3, "3 requests at cap")
    print("truncated at max_pages: OK")

    print("OK test-deactivate-stale")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
