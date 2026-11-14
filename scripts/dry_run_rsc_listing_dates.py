#!/usr/bin/env python3
"""
Dry-run: Lidl / Kaufland / Plodine — stari now+7 vs RSC validFrom/validTo.
Lokalno, BEZ upisa u bazu.

  py -3 scripts/dry_run_rsc_listing_dates.py --pages 2
"""
from __future__ import annotations

import argparse
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scraper"))

from config import BASE_URL, CHAIN_NAMES  # noqa: E402
from parsers.najcijena import ListingDateStats, parse_listing_page  # noqa: E402
from parsers.rsc_dates import parse_rsc_dates  # noqa: E402

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "hr,en;q=0.9",
}

CHAINS = ("lidl", "kaufland", "plodine")


def fetch_pages(client: httpx.Client, slug: str, pages: int) -> list[str]:
    htmls: list[str] = []
    for page in range(1, pages + 1):
        url = f"{BASE_URL}/trgovina/{slug}?page={page}"
        print(f"  GET {url}")
        resp = client.get(url, headers=HEADERS, timeout=45)
        if resp.status_code == 404:
            print(f"  -> 404 stop")
            break
        resp.raise_for_status()
        if page == 1 and "product-card" not in resp.text:
            url = f"{BASE_URL}/?vendor={slug}&page={page}"
            print(f"  GET {url} (vendor fallback)")
            resp = client.get(url, headers=HEADERS, timeout=45)
            resp.raise_for_status()
        htmls.append(resp.text)
        time.sleep(0.6)
    return htmls


def run_chain(slug: str, pages: int, now: datetime) -> None:
    chain = CHAIN_NAMES[slug]
    old_until = now + timedelta(days=7)
    stats = ListingDateStats()
    print(f"\n=== {slug.upper()} ({chain}) ===")

    with httpx.Client() as client:
        htmls = fetch_pages(client, slug, pages)

    all_deals = []
    rsc_all: dict = {}
    for html in htmls:
        rsc_all.update(parse_rsc_dates(html))
        all_deals.extend(parse_listing_page(html, chain, stats=stats, now=now))

    for d in all_deals[:12]:
        pair = rsc_all.get(d.external_id)
        rsc_s = f"{pair[0]} → {pair[1]}" if pair else "(nema RSC)"
        print(
            f"  {d.name[:48]:<48} | old: {now.date()}→{old_until.date()} "
            f"| rsc: {rsc_s} | used={d.date_source} "
            f"| until={d.valid_until.date()}"
        )

    print(
        f"SAŽETAK {slug}: real={stats.real} fallback={stats.fallback} "
        f"expired_skipped={stats.expired_skipped} "
        f"trajanje 1–3={stats.duration_1_3} 4–7={stats.duration_4_7} "
        f"8+={stats.duration_8_plus} "
        f"aktivnih_u_parseru={stats.real + stats.fallback} "
        f"(uzorak print={min(12, len(all_deals))})"
    )


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--pages", type=int, default=2)
    args = p.parse_args()
    now = datetime.now(timezone.utc)
    print(f"now_utc={now.isoformat()} pages={args.pages}")
    print(
        "Odabir za istekle: SKIP (ne ubacuj) — sync_deal uvijek stavlja is_active=true; "
        "ubacivanje s false zahtijevalo bi promjenu write patha."
    )
    for slug in CHAINS:
        try:
            run_chain(slug, args.pages, now)
        except Exception as e:
            print(f"X {slug}: {e}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
