#!/usr/bin/env python3
"""
Backfill quantity_value, quantity_unit, product_type na regular_prices.
Zahtijeva migraciju 010 (kolone).

  cd scraper && python backfill_quantity_type.py
  python backfill_quantity_type.py --dry-run
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

from quantity_parse import enrich_from_name

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT.parent / ".env")
load_dotenv(ROOT / ".env")

PAGE = 1000
BATCH = 200


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    url = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
    key = (
        os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        or os.getenv("SUPABASE_KEY")
        or os.getenv("VITE_SUPABASE_ANON_KEY")
    )
    if not url or not key:
        print("Missing SUPABASE_URL / key", file=sys.stderr)
        return 1

    sb = create_client(url.strip().strip('"'), key.strip().strip('"'))

    start = 0
    scanned = 0
    with_qty = 0
    with_type = 0
    updates: list[dict] = []

    while True:
        res = (
            sb.table("regular_prices")
            .select("id, name")
            .range(start, start + PAGE - 1)
            .execute()
        )
        chunk = res.data or []
        if not chunk:
            break
        for row in chunk:
            scanned += 1
            enriched = enrich_from_name(row.get("name"))
            if enriched["quantity_value"] is not None:
                with_qty += 1
            if enriched["product_type"]:
                with_type += 1
            updates.append(
                {
                    "id": row["id"],
                    "quantity_value": enriched["quantity_value"],
                    "quantity_unit": enriched["quantity_unit"],
                    "product_type": enriched["product_type"],
                }
            )
        if len(chunk) < PAGE:
            break
        start += PAGE
        if start % 20000 == 0:
            print(f"... scanned {scanned}")

    print(
        f"scanned={scanned} with_qty={with_qty} ({100*with_qty/max(scanned,1):.1f}%) "
        f"with_type={with_type} ({100*with_type/max(scanned,1):.1f}%)"
    )

    if args.dry_run:
        print("dry-run: no writes")
        for u in updates[:8]:
            print(u)
        return 0

    # Upsert by id in batches (only the 3 new cols + id)
    done = 0
    for i in range(0, len(updates), BATCH):
        batch = updates[i : i + BATCH]
        sb.table("regular_prices").upsert(batch, on_conflict="id").execute()
        done += len(batch)
        if done % 2000 == 0 or done == len(updates):
            print(f"updated {done}/{len(updates)}")

    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
