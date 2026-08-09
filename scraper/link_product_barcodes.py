#!/usr/bin/env python3
"""
Ponovno povezivanje products.barcode iz regular_prices (isti lanac + točan naziv).

Sigurna pravila kao u 009_link_product_barcodes.sql.
Za jednokratno punjenje u Supabase SQL Editoru radije pokreni 009_*.sql.

  cd scraper && python link_product_barcodes.py
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT.parent / ".env")
load_dotenv(ROOT / ".env")

URL = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
KEY = (
    os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    or os.getenv("SUPABASE_KEY")
)
PAGE = 1000


def fetch_all(sb, table: str, columns: str, **filters):
    rows = []
    start = 0
    while True:
        q = sb.table(table).select(columns).range(start, start + PAGE - 1)
        for key, val in filters.items():
            if key == "eq":
                for col, v in val.items():
                    q = q.eq(col, v)
            elif key == "is_null":
                for col in val:
                    q = q.is_(col, "null")
        chunk = q.execute().data or []
        rows.extend(chunk)
        if len(chunk) < PAGE:
            break
        start += PAGE
    return rows


def main() -> int:
    if not URL or not KEY:
        print("Nedostaje SUPABASE_URL / service role key u .env")
        return 1

    sb = create_client(URL, KEY)

    products = fetch_all(sb, "products", "id, name, barcode", is_null=["barcode"])
    if not products:
        print("Nema proizvoda bez barkoda.")
        return 0

    deals = fetch_all(sb, "deals", "product_id, store_id", eq={"is_active": True})
    stores = fetch_all(sb, "stores", "id, chain")
    store_chain = {s["id"]: s.get("chain") for s in stores}

    product_chains: dict[str, set[str]] = {}
    for d in deals:
        pid = d.get("product_id")
        chain = store_chain.get(d.get("store_id"))
        if not pid or not chain:
            continue
        product_chains.setdefault(pid, set()).add(chain)

    regs = fetch_all(sb, "regular_prices", "name, chain, barcode")
    index: dict[tuple[str, str], set[str]] = {}
    for r in regs:
        name = (r.get("name") or "").strip().lower()
        chain = r.get("chain") or ""
        bc = (r.get("barcode") or "").strip()
        if not name or not chain or len(bc) < 8:
            continue
        index.setdefault((name, chain), set()).add(bc)

    updated = 0
    skipped_ambiguous = 0
    skipped_no_match = 0

    for p in products:
        pid = p["id"]
        name_key = (p.get("name") or "").strip().lower()
        if len(name_key) < 3:
            skipped_no_match += 1
            continue
        chains = product_chains.get(pid) or set()
        if not chains:
            skipped_no_match += 1
            continue

        barcodes: set[str] = set()
        for chain in chains:
            barcodes |= index.get((name_key, chain), set())

        if len(barcodes) == 0:
            skipped_no_match += 1
            continue
        if len(barcodes) > 1:
            skipped_ambiguous += 1
            continue

        barcode = next(iter(barcodes))
        sb.table("products").update({"barcode": barcode}).eq("id", pid).is_(
            "barcode", "null"
        ).execute()
        updated += 1

    print(f"Ažurirano: {updated}")
    print(f"Preskočeno (nema poklapanja): {skipped_no_match}")
    print(f"Preskočeno (više barkodova / sumnjivo): {skipped_ambiguous}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
