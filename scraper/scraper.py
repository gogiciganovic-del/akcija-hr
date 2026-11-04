#!/usr/bin/env python3
"""
Scraper za sve trgovine na najcijena.hr
Korištenje: py scraper.py --store lidl --pages 2
            py scraper.py --all --pages 3
            py scraper.py --all --deactivate-stale   # Faza 1: report-only
"""

from __future__ import annotations

import argparse
import sys
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).parent))

from config import BASE_URL, CHAIN_NAMES, STORES
from deactivate_stale import listing_complete
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

RETRY_STATUS = {429, 503}
RETRY_WAIT_SEC = 10
MAX_RETRIES = 2


@dataclass
class StoreFetchResult:
    deals: list[ScrapedDeal]
    fetch_ok: bool
    pages_fetched: int
    last_page_cards: int
    complete: bool
    max_pages: int


def get_with_retry(client: httpx.Client, url: str) -> httpx.Response:
    """Na 429/503 čeka 10s i pokušava još MAX_RETRIES puta."""
    for attempt in range(MAX_RETRIES + 1):
        resp = client.get(url, headers=HEADERS, timeout=30)
        if resp.status_code in RETRY_STATUS and attempt < MAX_RETRIES:
            print(
                f"  -> HTTP {resp.status_code}, cekam {RETRY_WAIT_SEC}s "
                f"(pokusaj {attempt + 1}/{MAX_RETRIES})..."
            )
            time.sleep(RETRY_WAIT_SEC)
            continue
        resp.raise_for_status()
        return resp
    raise RuntimeError(f"Prekoracen broj pokusaja za {url}")


def _listing_url(store_slug: str, page: int, use_vendor: bool) -> str:
    if use_vendor:
        return f"{BASE_URL}/?vendor={store_slug}&page={page}"
    return f"{BASE_URL}/trgovina/{store_slug}?page={page}"


def fetch_store(client, store_slug, max_pages) -> StoreFetchResult:
    """
    Originalno pravilo zaustavljanja: staje kad stranica ne donese nijednu
    NOVU ponudu (len(new)==0) ili kad dohvat padne. complete se računa
    odvojeno (prirodni kraj vs odrezan max_pages) i ne utječe na petlju.
    """
    chain = CHAIN_NAMES[store_slug]
    all_deals: list[ScrapedDeal] = []
    seen: set[str] = set()
    use_vendor = False
    fetch_ok = True
    pages_fetched = 0
    last_page_cards = 0
    stopped_naturally = False

    for page in range(1, max_pages + 1):
        url = _listing_url(store_slug, page, use_vendor)
        print(f"  -> Ucitavam {url}")
        try:
            resp = get_with_retry(client, url)
        except Exception as e:
            print(f"  X Greska: {e}")
            fetch_ok = False
            break

        batch = parse_listing_page(resp.text, chain)

        if page == 1 and len(batch) == 0 and not use_vendor:
            use_vendor = True
            url = _listing_url(store_slug, page, use_vendor)
            print(f"  -> Nema akcija na /trgovina/, pokusavam {url}")
            try:
                resp = get_with_retry(client, url)
            except Exception as e:
                print(f"  X Greska (vendor): {e}")
                fetch_ok = False
                break
            batch = parse_listing_page(resp.text, chain)

        pages_fetched = page
        last_page_cards = len(batch)

        new = [d for d in batch if d.external_id not in seen]
        for d in new:
            seen.add(d.external_id)
        all_deals.extend(new)
        print(f"    Pronadeno {len(new)} novih akcija (ukupno {len(all_deals)})")

        if len(new) == 0:
            stopped_naturally = True
            break
        time.sleep(0.8)

    complete = listing_complete(
        fetch_ok=fetch_ok,
        stopped_naturally=stopped_naturally,
    )

    return StoreFetchResult(
        deals=all_deals,
        fetch_ok=fetch_ok,
        pages_fetched=pages_fetched,
        last_page_cards=last_page_cards,
        complete=complete,
        max_pages=max_pages,
    )


def run_deactivate_stale_report(
    *,
    per_store: list[tuple[str, StoreFetchResult]],
    apply: bool,
    pass_started_at: datetime,
    visible_before_by_store: dict[str, int],
    writer: ScraperSupabaseWriter,
) -> int:
    """
    Faza 1: report-only (apply=False) — čita DB, ispisuje plan, ne gasi.
    apply=True samo uz eksplicitni --apply-deactivate-stale (Faza 2).
    visible_before_by_store mora biti snimljen PRIJE save_deals.
    """
    from deactivate_stale import (
        apply_deactivate_before_scraped_at,
        build_plan_for_chain,
    )

    print("\n=== deactivate-stale (report-only=%s) ===" % (not apply))
    print(f"pass_started_at={pass_started_at.isoformat()} apply={apply}")

    for store_slug, result in per_store:
        chain = CHAIN_NAMES[store_slug]
        store_id = writer.get_store_id(chain)
        plan = build_plan_for_chain(
            writer.client,
            chain=chain,
            store_id=store_id,
            seen=len(result.deals),
            visible_before=visible_before_by_store.get(store_slug, 0),
            fetch_ok=result.fetch_ok,
            pages_fetched=result.pages_fetched,
            last_page_cards=result.last_page_cards,
            complete=result.complete,
            pass_started_at=pass_started_at,
        )
        print(f"  {plan.summary_line()}")
        if plan.warning:
            print(f"    ! {plan.warning}")
        if apply and plan.guard_ok:
            n = apply_deactivate_before_scraped_at(
                writer.client,
                store_id=store_id,
                pass_started_at=pass_started_at,
            )
            print(f"    applied_deactivate={n}")
        elif apply and not plan.guard_ok:
            print("    applied_deactivate=0 (guard blocked)")
    return 0


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--store", choices=STORES, help="Jedna trgovina")
    parser.add_argument("--all", action="store_true", help="Sve trgovine")
    parser.add_argument("--pages", type=int, default=3)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--deactivate-stale",
        action="store_true",
        help="Faza 1: report-only last-seen izvještaj u istom prolazu (bez gašenja)",
    )
    parser.add_argument(
        "--apply-deactivate-stale",
        action="store_true",
        help="Faza 2: stvarno piši is_active=false (Faza 1: ne koristi)",
    )
    args = parser.parse_args()

    if not args.store and not args.all:
        print("Koristi --store lidl ili --all")
        return 1

    if args.apply_deactivate_stale and args.dry_run:
        print("Ne mogu --apply-deactivate-stale zajedno s --dry-run")
        return 1

    # Faza 1: --deactivate-stale = samo izvještaj, nikad apply osim eksplicitnog flaga
    do_report = bool(args.deactivate_stale or args.apply_deactivate_stale)
    do_apply = bool(args.apply_deactivate_stale) and not args.dry_run

    stores = STORES if args.all else [args.store]

    per_store: list[tuple[str, StoreFetchResult]] = []
    with httpx.Client() as client:
        all_deals: list[ScrapedDeal] = []
        for store in stores:
            print(f"\nScraping: {store.upper()}")
            result = fetch_store(client, store, args.pages)
            per_store.append((store, result))
            all_deals.extend(result.deals)
            print(
                f"  OK {store}: {len(result.deals)} akcija "
                f"pages={result.pages_fetched} last_page_cards={result.last_page_cards} "
                f"complete={str(result.complete).lower()} "
                f"fetch_ok={str(result.fetch_ok).lower()}"
            )

    print(f"\nUkupno: {len(all_deals)} akcija")

    writer: ScraperSupabaseWriter | None = None
    pass_started_at = datetime.now().astimezone()
    visible_before_by_store: dict[str, int] = {}

    if do_report or not args.dry_run:
        writer = ScraperSupabaseWriter()

    if do_report and writer is not None:
        from deactivate_stale import visible_deals_for_store

        # Snimka PRIJE upisa (active_deals semantika).
        for store_slug, _result in per_store:
            chain = CHAIN_NAMES[store_slug]
            store_id = writer.get_store_id(chain)
            visible_before_by_store[store_slug] = len(
                visible_deals_for_store(writer.client, store_id)
            )

    if args.dry_run:
        print("DRY RUN — nista nije spremljeno.")
        if do_report and writer is not None:
            try:
                return run_deactivate_stale_report(
                    per_store=per_store,
                    apply=False,
                    pass_started_at=pass_started_at,
                    visible_before_by_store=visible_before_by_store,
                    writer=writer,
                )
            except Exception as exc:
                print(f"  ! deactivate-stale report nije uspio: {exc}")
                return 0
        return 0

    print("\nSpremanje u Supabase...")
    assert writer is not None
    # Cutoff već snimljen PRIJE visible_before i upisa.
    stats = writer.save_deals(all_deals)
    print(f"Gotovo: {stats['deals']} akcija, {stats['errors']} gresaka")

    # Barkod iz kataloga (strip sufiks + unique + price guard) — preživi refresh
    print("\nPovezivanje products.barcode s regular_prices...")
    try:
        from link_product_barcodes import link_active_deal_barcodes

        link_stats = link_active_deal_barcodes(writer.client, dry_run=False)
        print(
            f"Barkodovi: unique={link_stats['unique']} "
            f"updated={link_stats['updated']} "
            f"already={link_stats['already_ok']} "
            f"rejected_price={link_stats['rejected_price']} "
            f"ambiguous={link_stats['ambiguous']}"
        )
    except Exception as exc:
        print(f"  ! link_product_barcodes nije uspio (deals su spremljeni): {exc}")

    # Isti prolaz: report-only (Faza 1) ili apply (Faza 2, eksplicitno)
    if do_report:
        try:
            run_deactivate_stale_report(
                per_store=per_store,
                apply=do_apply,
                pass_started_at=pass_started_at,
                visible_before_by_store=visible_before_by_store,
                writer=writer,
            )
        except Exception as exc:
            print(f"  ! deactivate-stale nije uspio: {exc}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
