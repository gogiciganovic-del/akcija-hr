#!/usr/bin/env python3
"""Per-chain page caps via PAGES_BY_CHAIN; others → DEFAULT_PAGES; CLI --pages overrides."""
from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scraper"))

from config import (  # noqa: E402
    DEFAULT_PAGES,
    PAGES_BY_CHAIN,
    STORES,
    pages_for_store,
)
from scraper import fetch_store  # noqa: E402


def assert_true(cond: bool, msg: str) -> None:
    if not cond:
        raise AssertionError(msg)


def _card_html(ext_id: str) -> str:
    return (
        f'<a class="product-card" href="/akcija/item-{ext_id}">'
        f'<div class="product-card__thumb"><img alt="Item {ext_id} - Akcija" '
        f'src="https://x/{ext_id}.jpg"></div>'
        f'<span class="text-price">1,99</span>'
        f'<span class="regular-price">2,99</span>'
        f"</a>"
    )


def _page_html(n_cards: int, id_start: int) -> str:
    cards = "".join(_card_html(str(id_start + i)) for i in range(n_cards))
    return f"<html><body>{cards}</body></html>"


class FakeResp:
    def __init__(self, text: str, status_code: int = 200):
        self.text = text
        self.status_code = status_code

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


class CountingClient:
    """Every page returns 50 unique cards so fetch continues until max_pages."""

    def __init__(self):
        self.requests = 0

    def get(self, url: str, **_kwargs):
        self.requests += 1
        page = 1
        if "page=" in url:
            try:
                page = int(url.split("page=")[1].split("&")[0])
            except ValueError:
                page = 1
        # Unique ids per page so len(new) never hits 0 before max_pages
        return FakeResp(_page_html(50, page * 1000))


def main() -> int:
    expected = {
        "lidl": 20,
        "kaufland": 18,
        "plodine": 18,
        "konzum": 16,
        "interspar": 16,
        "spar": 12,
    }
    assert_true(DEFAULT_PAGES == 3, f"DEFAULT_PAGES={DEFAULT_PAGES}")
    assert_true(PAGES_BY_CHAIN == expected, f"PAGES_BY_CHAIN={PAGES_BY_CHAIN}")

    for slug in STORES:
        want = expected.get(slug, DEFAULT_PAGES)
        got = pages_for_store(slug)
        assert_true(got == want, f"{slug}: default pages {got} != {want}")

    assert_true(pages_for_store("lidl", 5) == 5, "CLI override lidl")
    assert_true(pages_for_store("eurospin", 5) == 5, "CLI override eurospin")
    assert_true(pages_for_store("lidl", 3) == 3, "CLI --pages 3 forces 3")
    assert_true(pages_for_store("kaufland", 18) == 18, "CLI override equals default")
    print("pages_for_store mapping: OK")

    # fetch_store respects per-chain max_pages (lidl=20; no early empty/404)
    client = CountingClient()
    with patch("scraper.time.sleep", lambda _s: None):
        with patch("scraper.BASE_URL", "https://najcijena.hr"):
            result = fetch_store(client, "lidl", pages_for_store("lidl"))
    assert_true(client.requests == 20, f"lidl requests={client.requests}")
    assert_true(result.pages_fetched == 20, f"pages_fetched={result.pages_fetched}")
    assert_true(len(result.deals) == 1000, f"deals={len(result.deals)}")
    assert_true(result.complete is False, "hit max_pages → truncated/complete=False")
    print("lidl fetch uses 20 pages: OK")

    client_k = CountingClient()
    with patch("scraper.time.sleep", lambda _s: None):
        with patch("scraper.BASE_URL", "https://najcijena.hr"):
            rk = fetch_store(client_k, "kaufland", pages_for_store("kaufland"))
    assert_true(client_k.requests == 18, f"kaufland requests={client_k.requests}")
    assert_true(rk.pages_fetched == 18, f"kaufland pages_fetched={rk.pages_fetched}")
    assert_true(len(rk.deals) == 900, f"kaufland deals={len(rk.deals)}")
    print("kaufland fetch uses 18 pages: OK")

    client_s = CountingClient()
    with patch("scraper.time.sleep", lambda _s: None):
        with patch("scraper.BASE_URL", "https://najcijena.hr"):
            rs = fetch_store(client_s, "eurospin", pages_for_store("eurospin"))
    assert_true(client_s.requests == 3, f"eurospin requests={client_s.requests}")
    assert_true(len(rs.deals) == 150, f"eurospin deals={len(rs.deals)}")
    print("eurospin fetch uses 3 pages: OK")

    print("OK test-bigger-pages")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
