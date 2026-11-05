#!/usr/bin/env python3
"""Mock HTTP tests: fetch_store treats post-success 404 as natural listing end."""
from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scraper"))

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


class ScriptedClient:
    """Returns FakeResp by page number from a dict; missing → 200 empty."""

    def __init__(self, by_page: dict[int, FakeResp]):
        self.by_page = by_page
        self.requests = 0
        self.urls: list[str] = []
        self.status_codes: list[int] = []

    def get(self, url: str, **_kwargs):
        self.requests += 1
        self.urls.append(url)
        page = 1
        if "page=" in url:
            try:
                page = int(url.split("page=")[1].split("&")[0])
            except ValueError:
                page = 1
        resp = self.by_page.get(page, FakeResp("<html><body></body></html>", 200))
        self.status_codes.append(resp.status_code)
        return resp


def _run_fetch(client, slug: str = "lidl", max_pages: int = 10):
    with patch("scraper.time.sleep", lambda _s: None):
        with patch("scraper.BASE_URL", "https://najcijena.hr"):
            # Avoid real retry waits on 429
            with patch("scraper.MAX_RETRIES", 0):
                with patch("scraper.RETRY_WAIT_SEC", 0):
                    return fetch_store(client, slug, max_pages)


def main() -> int:
    # 1) 404 after successful pages → natural end, fetch_ok=True
    client_ok = ScriptedClient(
        {
            1: FakeResp(_page_html(46, 1000), 200),
            2: FakeResp(_page_html(30, 2000), 200),
            3: FakeResp("not found", 404),
        }
    )
    r_ok = _run_fetch(client_ok, max_pages=10)
    assert_true(r_ok.fetch_ok is True, "404 after success → fetch_ok True")
    assert_true(r_ok.complete is True, "404 after success → complete")
    assert_true(len(r_ok.deals) == 76, f"expected 76 deals got {len(r_ok.deals)}")
    assert_true(r_ok.pages_fetched == 2, f"pages_fetched={r_ok.pages_fetched}")
    assert_true(client_ok.requests == 3, f"requests={client_ok.requests}")
    assert_true(client_ok.status_codes[-1] == 404, "last request was 404")
    print("404 after success pages: OK")

    # 2) 404 on page=1 → fetch_ok=False
    client_p1 = ScriptedClient({1: FakeResp("gone", 404)})
    r_p1 = _run_fetch(client_p1, max_pages=5)
    assert_true(r_p1.fetch_ok is False, "404 on page=1 → fetch_ok False")
    assert_true(r_p1.complete is False, "404 on page=1 → not complete")
    assert_true(len(r_p1.deals) == 0, "no deals on page=1 404")
    assert_true(r_p1.pages_fetched == 0, "pages_fetched stays 0")
    print("404 on page=1: OK")

    # 3) 429 after success → still an error (not natural end)
    client_429 = ScriptedClient(
        {
            1: FakeResp(_page_html(20, 3000), 200),
            2: FakeResp("rate limit", 429),
        }
    )
    r_429 = _run_fetch(client_429, max_pages=5)
    assert_true(r_429.fetch_ok is False, "429 → fetch_ok False")
    assert_true(r_429.complete is False, "429 → not complete")
    assert_true(len(r_429.deals) == 20, f"kept page1 deals, got {len(r_429.deals)}")
    print("429 after success: OK")

    # 4) 500 after success → error
    client_500 = ScriptedClient(
        {
            1: FakeResp(_page_html(10, 4000), 200),
            2: FakeResp("boom", 500),
        }
    )
    r_500 = _run_fetch(client_500, max_pages=5)
    assert_true(r_500.fetch_ok is False, "500 → fetch_ok False")
    assert_true(r_500.complete is False, "500 → not complete")
    assert_true(len(r_500.deals) == 10, f"kept page1 deals, got {len(r_500.deals)}")
    print("500 after success: OK")

    print("OK test-fetch-404-end")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
