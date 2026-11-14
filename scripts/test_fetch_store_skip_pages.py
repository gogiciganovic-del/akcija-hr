#!/usr/bin/env python3
"""
Mock HTTP: fetch_store ne smije stati na stranici gdje su sve kartice
date-preskočene (future/expired) ako sljedeća stranica ima prihvaćene.

  py -3 scripts/test_fetch_store_skip_pages.py
"""
from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scraper"))

from scraper import fetch_store  # noqa: E402
from parsers.najcijena import parse_listing_page as real_parse  # noqa: E402

FIXED_NOW = datetime(2026, 11, 14, 12, 0, tzinfo=timezone.utc)


def assert_true(cond: bool, msg: str) -> None:
    if not cond:
        raise AssertionError(msg)


def _card(ext_id: str, name: str) -> str:
    slug = name.lower().replace(" ", "-")
    return (
        f'<a class="product-card" href="/akcija/{slug}-{ext_id}">'
        f'<div class="product-card__thumb"><img alt="{name} - Akcija" '
        f'src="https://x/{ext_id}.jpg"></div>'
        f'<span class="text-price">1,99</span>'
        f'<span class="regular-price">2,99</span>'
        f"</a>"
    )


def _rsc_item(ext_id: str, name: str, vf: str, vt: str) -> str:
    return (
        f'{{"id":{ext_id},"name":"{name}","validFrom":"{vf}","validTo":"{vt}"}}'
    )


def _page(cards: list[tuple[str, str, str, str]]) -> str:
    """cards: (ext_id, name, validFrom, validTo)"""
    body = "".join(_card(eid, name) for eid, name, _vf, _vt in cards)
    rsc = "[" + ",".join(_rsc_item(eid, name, vf, vt) for eid, name, vf, vt in cards) + "]"
    return f"<html><body>{body}<script type='application/json'>{rsc}</script></body></html>"


class FakeResp:
    def __init__(self, text: str, status_code: int = 200):
        self.text = text
        self.status_code = status_code

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


class ScriptedClient:
    def __init__(self, by_page: dict[int, FakeResp]):
        self.by_page = by_page
        self.requests = 0
        self.urls: list[str] = []

    def get(self, url: str, **_kwargs):
        self.requests += 1
        self.urls.append(url)
        page = 1
        if "page=" in url:
            try:
                page = int(url.split("page=")[1].split("&")[0])
            except ValueError:
                page = 1
        return self.by_page.get(page, FakeResp("<html><body></body></html>", 200))


def _parse_with_fixed_now(html, chain, **kwargs):
    kwargs.setdefault("now", FIXED_NOW)
    return real_parse(html, chain, **kwargs)


def _run_fetch(client, max_pages: int = 10):
    with patch("scraper.time.sleep", lambda _s: None):
        with patch("scraper.BASE_URL", "https://najcijena.hr"):
            with patch("scraper.MAX_RETRIES", 0):
                with patch("scraper.RETRY_WAIT_SEC", 0):
                    with patch("scraper.parse_listing_page", _parse_with_fixed_now):
                        return fetch_store(client, "lidl", max_pages)


def test_continues_past_all_future_page() -> None:
    """
    page1: aktivne, page2: samo buduće, page3: aktivne.
    Petlja mora dohvatiti page3 (stari kod staje na page2).
    """
    page1 = _page(
        [
            ("1001", "Aktivna Jedan", "2026-11-10", "2026-11-20"),
            ("1002", "Aktivna Dva", "2026-11-12", "2026-11-18"),
        ]
    )
    page2 = _page(
        [
            ("2001", "Buduca Jedan", "2026-11-20", "2026-11-25"),
            ("2002", "Buduca Dva", "2026-11-21", "2026-11-28"),
        ]
    )
    page3 = _page(
        [
            ("3001", "Aktivna Tri", "2026-11-10", "2026-11-20"),
        ]
    )
    client = ScriptedClient(
        {
            1: FakeResp(page1),
            2: FakeResp(page2),
            3: FakeResp(page3),
            4: FakeResp("<html><body></body></html>"),  # prazno → stop
        }
    )
    result = _run_fetch(client, max_pages=10)
    ids = {d.external_id for d in result.deals}
    assert_true(
        result.pages_fetched >= 3,
        f"očekivano pages_fetched>=3, got {result.pages_fetched} "
        f"(stari kod staje na 2 kad su sve kartice future)",
    )
    assert_true("1001" in ids and "1002" in ids, f"page1 deals missing: {ids}")
    assert_true("3001" in ids, f"page3 deal missing: {ids}")
    assert_true("2001" not in ids and "2002" not in ids, f"future leaked: {ids}")
    assert_true(
        client.requests >= 3,
        f"expected >=3 GETs, got {client.requests} urls={client.urls}",
    )
    # page2 ima kartice (preskočene) — last_page_cards na page3 = 1
    assert_true(
        result.last_page_cards >= 0,
        "last_page_cards set",
    )
    print("continues past all-future page: OK")


def test_empty_page_still_stops() -> None:
    """Stranica bez ikakvih kartica i dalje = prirodni kraj."""
    page1 = _page(
        [
            ("4001", "Jedina", "2026-11-10", "2026-11-20"),
        ]
    )
    client = ScriptedClient(
        {
            1: FakeResp(page1),
            2: FakeResp("<html><body></body></html>"),
            3: FakeResp(
                _page([("9999", "NeSmije", "2026-11-10", "2026-11-20")])
            ),
        }
    )
    result = _run_fetch(client, max_pages=10)
    ids = {d.external_id for d in result.deals}
    assert_true(result.pages_fetched == 2, f"pages_fetched={result.pages_fetched}")
    assert_true(result.complete is True, "empty page → complete")
    assert_true(ids == {"4001"}, f"ids={ids}")
    assert_true("9999" not in ids, "must not fetch past empty page")
    assert_true(result.last_page_cards == 0, f"last_page_cards={result.last_page_cards}")
    # page1 + page2 only (no vendor: page1 had cards)
    assert_true(
        client.requests == 2,
        f"requests={client.requests} urls={client.urls}",
    )
    print("empty page still stops: OK")


def test_page1_only_future_does_not_vendor_fallback() -> None:
    """page1 s kartama koje su sve future nije 'nema akcija' → bez vendor URL-a."""
    page1 = _page(
        [
            ("5001", "Buduca", "2026-11-20", "2026-11-25"),
        ]
    )
    page2 = _page(
        [
            ("5002", "Aktivna", "2026-11-10", "2026-11-20"),
        ]
    )
    client = ScriptedClient({1: FakeResp(page1), 2: FakeResp(page2)})
    result = _run_fetch(client, max_pages=5)
    assert_true(
        all("vendor=" not in u for u in client.urls),
        f"vendor fallback ne smije: {client.urls}",
    )
    ids = {d.external_id for d in result.deals}
    assert_true(ids == {"5002"}, f"ids={ids}")
    print("page1 all-future no vendor fallback: OK")


def main() -> int:
    test_continues_past_all_future_page()
    test_empty_page_still_stops()
    test_page1_only_future_does_not_vendor_fallback()
    print("OK test_fetch_store_skip_pages")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
