#!/usr/bin/env python3
"""
Scraper za sve trgovine: Lidl, Kaufland, Konzum, Spar, Plodine, Eurospin
Korištenje: py scraper.py --store lidl --pages 2
            py scraper.py --all --pages 3
"""

from __future__ import annotations
import argparse
import sys
import time
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).parent))

from parser import parse_listing_page, ScrapedDeal
from supabase_writer import SupabaseWriter

CHAIN_NAMES = {
    "lidl": "Lidl",
    "kaufland": "Kaufland",
    "konzum": "Konzum",
    "spar": "Spar",
    "plodine": "Plodine",
    "eurospin": "Eurospin",
}

BASE_URL = "https://najcijena.hr"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "hr,en;q=0.9",
}

STORES = ["lidl", "kaufland", "konzum", "spar", "plodine", "eurospin"]


def fetch_store(client, store_slug, max_pages):
    chain = CHAIN_NAMES[store_slug]
    all_deals = []
    seen = set()

    for page in range(1, max_pages + 1):
        url = f"{BASE_URL}/trgovina/{store_slug}" + (f"?page={page}" if page > 1 else "")
        print(f"  → Učitavam {url}")
        try:
            resp = client.get(url, headers=HEADERS, timeout=30)
            resp.raise_for_status()
        except Exception as e:
            print(f"  ✗ Greška: {e}")
            break

        batch = parse_listing_page(resp.text, chain)
        new = [d for d in batch if d.external_id not in seen]
        for d in new:
            seen.add(d.external_id)
        all_deals.extend(new)
        print(f"    Pronađeno {len(new)} novih akcija (ukupno {len(all_deals)})")

        if len(new) == 0:
            break
        time.sleep(0.8)

    return all_deals


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--store", choices=STORES, help="Jedna trgovina")
    parser.add_argument("--all", action="store_true", help="Sve trgovine")
    parser.add_argument("--pages", type=int, default=3)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not args.store and not args.all:
        print("Koristi --store lidl ili --all")
        return 1

    stores = STORES if args.all else [args.store]

    with httpx.Client() as client:
        all_deals = []
        for store in stores:
            print(f"\n🛒 Scraping: {store.upper()}")
            deals = fetch_store(client, store, args.pages)
            all_deals.extend(deals)
            print(f"  ✓ {store}: {len(deals)} akcija")

    print(f"\nUkupno: {len(all_deals)} akcija")

    if args.dry_run:
        print("DRY RUN — ništa nije spremljeno.")
        return 0

    print("\nSpremanje u Supabase...")
    writer = SupabaseWriter()
    stats = writer.save_deals(all_deals)
    print(f"✓ Gotovo: {stats['deals']} akcija, {stats['errors']} grešaka")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())