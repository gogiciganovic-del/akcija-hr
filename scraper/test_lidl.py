#!/usr/bin/env python3
"""
Korak 1: test scraper samo za Lidl (najcijena.hr → Supabase).

Primjer:
  cd scraper
  pip install -r requirements.txt
  python test_lidl.py --dry-run --pages 2
  python test_lidl.py --pages 3 --limit 30
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import httpx

# Omogući import iz scraper/ mape
sys.path.insert(0, str(Path(__file__).parent))

from config import BASE_URL, CHAIN_NAMES
from parsers.najcijena import ScrapedDeal, enrich_from_detail_html, parse_listing_page
from db.supabase_client import SupabaseWriter

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "hr-HR,hr;q=0.9",
}


def fetch_listing_pages(client: httpx.Client, max_pages: int) -> list[ScrapedDeal]:
    chain = CHAIN_NAMES["lidl"]
    all_deals: list[ScrapedDeal] = []
    seen: set[str] = set()

    for page in range(1, max_pages + 1):
        url = f"{BASE_URL}/trgovina/lidl" + (f"?page={page}" if page > 1 else "")
        print(f"  → Učitavam {url}")
        resp = client.get(url, headers=HEADERS, timeout=30)
        resp.raise_for_status()

        batch = parse_listing_page(resp.text, chain)
        new = [d for d in batch if d.external_id not in seen]
        for d in new:
            seen.add(d.external_id)
        all_deals.extend(new)
        print(f"     Pronađeno {len(new)} novih akcija (ukupno {len(all_deals)})")

        if len(new) == 0:
            break
        time.sleep(0.8)

    return all_deals


def enrich_deals(client: httpx.Client, deals: list[ScrapedDeal], limit: int | None) -> None:
    subset = deals[:limit] if limit else deals
    print(f"\n  → Dohvat detalja za {len(subset)} akcija (datumi, kategorija)...")

    for i, deal in enumerate(subset, 1):
        try:
            resp = client.get(deal.source_url, headers=HEADERS, timeout=25)
            resp.raise_for_status()
            enrich_from_detail_html(deal, resp.text)
        except Exception as exc:
            print(f"     ⚠ {deal.name}: {exc}")
        if i % 10 == 0:
            time.sleep(0.5)


def print_sample(deals: list[ScrapedDeal], n: int = 5) -> None:
    print(f"\n{'=' * 60}")
    print(f"UZORAK ({min(n, len(deals))} od {len(deals)})")
    print("=" * 60)
    for d in deals[:n]:
        print(f"\n  {d.name}")
        print(f"    Cijena: {d.price:.2f} €  (bilo {d.original_price:.2f} €, -{d.discount_pct}%)")
        print(f"    Kategorija: {d.category}")
        print(f"    Vrijedi: {d.valid_from.date()} → {d.valid_until.date()}")
        print(f"    URL: {d.source_url}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Test scraper — Lidl → Supabase")
    parser.add_argument("--pages", type=int, default=2, help="Broj stranica listinga (default: 2)")
    parser.add_argument("--limit", type=int, default=None, help="Max akcija za detail enrich + save")
    parser.add_argument("--dry-run", action="store_true", help="Samo scrape, bez upisa u bazu")
    parser.add_argument("--no-enrich", action="store_true", help="Preskoči dohvat detaljnih stranica")
    args = parser.parse_args()

    print("=" * 60)
    print("NAJCIJENA.HR SCRAPER — TEST LIDL")
    print("=" * 60)

    with httpx.Client(follow_redirects=True) as client:
        print("\n[1/3] Scraping listing stranica...")
        deals = fetch_listing_pages(client, args.pages)

        if not deals:
            print("\n✗ Nema pronađenih akcija. Provjeri URL ili strukturu stranice.")
            return 1

        if not args.no_enrich:
            print("\n[2/3] Obogaćivanje detaljima...")
            enrich_deals(client, deals, args.limit)
        else:
            print("\n[2/3] Preskočeno obogaćivanje detaljima")

        print_sample(deals)

        if args.dry_run:
            print(f"\n[3/3] DRY RUN — {len(deals)} akcija, ništa nije spremljeno u Supabase.")
            return 0

        print("\n[3/3] Spremanje u Supabase...")
        to_save = deals[: args.limit] if args.limit else deals
        writer = SupabaseWriter()
        stats = writer.save_deals(to_save)
        print(f"\n✓ Gotovo: {stats['deals']} akcija, {stats['errors']} grešaka")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
