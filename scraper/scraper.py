#!/usr/bin/env python3
"""
Scraper za sve trgovine na najcijena.hr
Korištenje: py scraper.py --store lidl --pages 2
            py scraper.py --all --pages 3
"""

from __future__ import annotations

import argparse
import sys
import time
from datetime import datetime
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).parent))

from config import BASE_URL, CHAIN_NAMES, STORES
from parser import parse_listing_page
from parsers.najcijena import ScrapedDeal
from supabase_writer import SupabaseWriter


class ScraperSupabaseWriter(SupabaseWriter):
    """Upis u deals s scraped_at za filter Novo."""

    def sync_deal(self, deal: ScrapedDeal, store_id: str, product_id: str) -> None:
        self.client.table("deals").update({"is_active": False}).eq(
            "store_id", store_id
        ).eq("product_id", product_id).eq("is_active", True).execute()

        self.client.table("deals").insert(
            {
                "product_id": product_id,
                "store_id": store_id,
                "price": deal.price,
                "original_price": deal.original_price,
                "discount_pct": deal.discount_pct,
                "valid_from": deal.valid_from.isoformat(),
                "valid_until": deal.valid_until.isoformat(),
                "is_active": True,
                "scraped_at": datetime.now().isoformat(),
            }
        ).execute()

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "hr,en;q=0.9",
}


def _listing_url(store_slug: str, page: int, use_vendor: bool) -> str:
    if use_vendor:
        return f"{BASE_URL}/?vendor={store_slug}&page={page}"
    return f"{BASE_URL}/trgovina/{store_slug}?page={page}"


def fetch_store(client, store_slug, max_pages):
    chain = CHAIN_NAMES[store_slug]
    all_deals = []
    seen = set()
    use_vendor = False

    for page in range(1, max_pages + 1):
        url = _listing_url(store_slug, page, use_vendor)
        print(f"  -> Ucitavam {url}")
        try:
            resp = client.get(url, headers=HEADERS, timeout=30)
            resp.raise_for_status()
        except Exception as e:
            print(f"  X Greska: {e}")
            break

        batch = parse_listing_page(resp.text, chain)

        if page == 1 and len(batch) == 0 and not use_vendor:
            use_vendor = True
            url = _listing_url(store_slug, page, use_vendor)
            print(f"  -> Nema akcija na /trgovina/, pokusavam {url}")
            resp = client.get(url, headers=HEADERS, timeout=30)
            resp.raise_for_status()
            batch = parse_listing_page(resp.text, chain)

        new = [d for d in batch if d.external_id not in seen]
        for d in new:
            seen.add(d.external_id)
        all_deals.extend(new)
        print(f"    Pronadeno {len(new)} novih akcija (ukupno {len(all_deals)})")

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
            print(f"\nScraping: {store.upper()}")
            deals = fetch_store(client, store, args.pages)
            all_deals.extend(deals)
            print(f"  OK {store}: {len(deals)} akcija")

    print(f"\nUkupno: {len(all_deals)} akcija")

    if args.dry_run:
        print("DRY RUN — nista nije spremljeno.")
        return 0

    print("\nSpremanje u Supabase...")
    writer = ScraperSupabaseWriter()
    stats = writer.save_deals(all_deals)
    print(f"Gotovo: {stats['deals']} akcija, {stats['errors']} gresaka")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
