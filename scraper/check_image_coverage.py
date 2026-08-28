#!/usr/bin/env python3
"""
Pokrivenost slika (image_url) u active_deals i regular_prices.

  cd scraper
  py -3 check_image_coverage.py
  py -3 check_image_coverage.py --overlap-only

Ne piše u bazu — samo čita i ispisuje.
"""

from __future__ import annotations

import argparse
import os
import sys
from collections import defaultdict
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT.parent / ".env")
load_dotenv(ROOT / ".env")

PAGE = 1000


def sb_client():
    url = (os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL") or "").strip().strip('"')
    key = (
        os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        or os.getenv("SUPABASE_KEY")
        or os.getenv("VITE_SUPABASE_ANON_KEY")
        or ""
    ).strip().strip('"')
    if not url or not key:
        raise SystemExit("Missing SUPABASE_URL / key")
    return create_client(url, key)


def has_image(url) -> bool:
    if url is None:
        return False
    s = str(url).strip()
    if not s or s.lower() in ("null", "undefined"):
        return False
    return True


def pct(num: int, den: int) -> str:
    if den <= 0:
        return "n/a"
    return f"{100.0 * num / den:.1f}%"


def count_exact(sb, table: str, *, with_image: bool = False) -> int:
    q = sb.table(table).select("*", count="exact").limit(1)
    if with_image:
        q = q.not_.is_("image_url", "null").neq("image_url", "")
    return q.execute().count or 0


def fetch_paginated(sb, table: str, columns: str) -> list[dict]:
    out: list[dict] = []
    offset = 0
    while True:
        res = (
            sb.table(table)
            .select(columns)
            .range(offset, offset + PAGE - 1)
            .execute()
        )
        rows = res.data or []
        if not rows:
            break
        out.extend(rows)
        if len(rows) < PAGE:
            break
        offset += PAGE
        if offset % 5000 == 0:
            print(f"  ... učitano {offset} redaka iz {table}", file=sys.stderr)
    return out


def chain_from_store_name(store_name: str | None) -> str:
    """Gruba normalizacija store_name → lanac (za usporedbu s regular_prices.chain)."""
    if not store_name:
        return "?"
    name = str(store_name).strip()
    lower = name.lower()
    chains = (
        "kaufland",
        "konzum",
        "lidl",
        "spar",
        "plodine",
        "eurospin",
        "tommy",
        "studenac",
        "interspar",
        "bipa",
        "mueller",
        "dm",
    )
    for c in chains:
        if c in lower:
            return c.capitalize() if c != "dm" else "Dm"
    return name.split()[0] if name else "?"


def summarize_rows(rows: list[dict], chain_key: str, image_key: str = "image_url") -> None:
    total = len(rows)
    with_img = sum(1 for r in rows if has_image(r.get(image_key)))
    print(f"  Ukupno:              {total}")
    print(f"  S image_url:         {with_img}  ({pct(with_img, total)})")
    print(f"  Bez slike:           {total - with_img}  ({pct(total - with_img, total)})")

    by_chain: dict[str, dict[str, int]] = defaultdict(lambda: {"total": 0, "with_img": 0})
    for row in rows:
        chain = row.get(chain_key) or "?"
        by_chain[chain]["total"] += 1
        if has_image(row.get(image_key)):
            by_chain[chain]["with_img"] += 1

    print()
    print(f"  {'lanac':<14} {'n':>7}  {'s slikom':>10}  {'postotak':>8}")
    for chain in sorted(by_chain.keys(), key=lambda c: (-by_chain[c]["total"], c)):
        sub = by_chain[chain]
        print(
            f"  {chain:<14} {sub['total']:>7}  "
            f"{sub['with_img']:>10}  {pct(sub['with_img'], sub['total']):>8}"
        )


def normalize_barcode(value) -> str | None:
    if value is None:
        return None
    s = str(value).strip()
    if not s or s.lower() in ("null", "undefined"):
        return None
    return s


def fetch_products_by_barcode(sb) -> dict[str, bool]:
    """barcode → ima li products red valjan image_url."""
    by_barcode: dict[str, bool] = {}
    offset = 0
    while True:
        res = (
            sb.table("products")
            .select("barcode, image_url")
            .not_.is_("barcode", "null")
            .neq("barcode", "")
            .range(offset, offset + PAGE - 1)
            .execute()
        )
        rows = res.data or []
        if not rows:
            break
        for row in rows:
            bc = normalize_barcode(row.get("barcode"))
            if not bc:
                continue
            img = has_image(row.get("image_url"))
            prev = by_barcode.get(bc)
            if prev is None:
                by_barcode[bc] = img
            elif img and not prev:
                by_barcode[bc] = True
        if len(rows) < PAGE:
            break
        offset += PAGE
        if offset % 5000 == 0:
            print(f"  ... učitano {offset} redaka iz products", file=sys.stderr)
    return by_barcode


def check_barcode_overlap(sb, rp_rows: list[dict] | None = None) -> None:
    print("=== Overlap: regular_prices.barcode → products ===")
    print("Lookup bi bio: regular_prices.barcode = products.barcode → products.image_url")
    print()

    if rp_rows is None:
        print("Učitavanje regular_prices (barcode, chain)...")
        rp_rows = fetch_paginated(sb, "regular_prices", "barcode, chain")

    rp_barcodes: set[str] = set()
    rp_rows_with_bc = 0
    rp_by_chain: dict[str, dict[str, int]] = defaultdict(
        lambda: {"rows": 0, "rows_with_bc": 0, "rows_in_products": 0, "rows_with_image": 0}
    )

    for row in rp_rows:
        chain = row.get("chain") or "?"
        bc = normalize_barcode(row.get("barcode"))
        rp_by_chain[chain]["rows"] += 1
        if not bc:
            continue
        rp_rows_with_bc += 1
        rp_barcodes.add(bc)
        rp_by_chain[chain]["rows_with_bc"] += 1

    print("Učitavanje products (barcode, image_url)...")
    products_by_bc = fetch_products_by_barcode(sb)
    products_barcodes = set(products_by_bc.keys())
    products_with_image = {bc for bc, ok in products_by_bc.items() if ok}

    overlap = rp_barcodes & products_barcodes
    overlap_with_image = rp_barcodes & products_with_image

    # Row-level: koliko redaka regular_prices bi dobilo sliku lookupom
    rows_in_products = 0
    rows_with_image = 0
    for row in rp_rows:
        bc = normalize_barcode(row.get("barcode"))
        if not bc:
            continue
        chain = row.get("chain") or "?"
        if bc in products_barcodes:
            rows_in_products += 1
            rp_by_chain[chain]["rows_in_products"] += 1
        if bc in products_with_image:
            rows_with_image += 1
            rp_by_chain[chain]["rows_with_image"] += 1

    distinct_total = len(rp_barcodes)
    distinct_overlap = len(overlap)
    distinct_overlap_img = len(overlap_with_image)

    print()
    print("--- Jedinstveni barkodovi (DISTINCT) ---")
    print(f"  regular_prices (s barkodom):     {distinct_total}")
    print(f"  products (s barkodom):         {len(products_barcodes)}")
    print(
        f"  overlap u products:              {distinct_overlap}  "
        f"({pct(distinct_overlap, distinct_total)} od RP barkodova)"
    )
    print(
        f"  overlap + products.image_url:    {distinct_overlap_img}  "
        f"({pct(distinct_overlap_img, distinct_total)} od RP barkodova)"
    )
    print(
        f"  RP barkodovi bez matcha:         {distinct_total - distinct_overlap}  "
        f"({pct(distinct_total - distinct_overlap, distinct_total)})"
    )

    print()
    print("--- Redovi regular_prices (ROW-LEVEL pokrivenost) ---")
    print(f"  Ukupno redaka:                   {len(rp_rows)}")
    print(f"  Redaka s barkodom:               {rp_rows_with_bc}  ({pct(rp_rows_with_bc, len(rp_rows))})")
    print(
        f"  Redaka s matchom u products:     {rows_in_products}  "
        f"({pct(rows_in_products, len(rp_rows))} svih RP, "
        f"{pct(rows_in_products, rp_rows_with_bc)} od RP s barkodom)"
    )
    print(
        f"  Redaka s products.image_url:     {rows_with_image}  "
        f"({pct(rows_with_image, len(rp_rows))} svih RP, "
        f"{pct(rows_with_image, rp_rows_with_bc)} od RP s barkodom)"
    )

    print()
    print(f"  {'lanac':<12} {'redaka':>8}  {'s bc':>8}  {'match':>8}  {'+slika':>8}  {'%slika':>7}")
    for chain in sorted(rp_by_chain.keys(), key=lambda c: (-rp_by_chain[c]["rows"], c)):
        sub = rp_by_chain[chain]
        print(
            f"  {chain:<12} {sub['rows']:>8}  {sub['rows_with_bc']:>8}  "
            f"{sub['rows_in_products']:>8}  {sub['rows_with_image']:>8}  "
            f"{pct(sub['rows_with_image'], sub['rows']):>7}"
        )


def main() -> int:
    parser = argparse.ArgumentParser(description="Image coverage + barcode overlap (read-only)")
    parser.add_argument(
        "--overlap-only",
        action="store_true",
        help="Samo overlap regular_prices → products (brže)",
    )
    args = parser.parse_args()
    sb = sb_client()

    rp_rows: list[dict] | None = None

    if not args.overlap_only:
        print("=== active_deals (Početna — akcije) ===")
        print("Izvor image_url: products.image_url kroz view active_deals")
        print("Učitavanje redaka...")
        deals = fetch_paginated(sb, "active_deals", "deal_id, store_name, image_url")
        deal_rows = [
            {
                "chain": chain_from_store_name(r.get("store_name")),
                "image_url": r.get("image_url"),
            }
            for r in deals
        ]
        summarize_rows(deal_rows, "chain")

        print()
        print("=== products (referenca — cijela tablica) ===")
        products_total = count_exact(sb, "products")
        products_img = count_exact(sb, "products", with_image=True)
        print(f"  Ukupno:              {products_total}")
        print(f"  S image_url:         {products_img}  ({pct(products_img, products_total)})")

        print()
        print("=== regular_prices (Pretraga — redovne cijene) ===")
        print("  Stupac image_url:    NE POSTOJI u shemi (migracija 006)")
        rp_total = count_exact(sb, "regular_prices")
        print(f"  Ukupno redaka:       {rp_total}")
        print(f"  S image_url:         0  (0.0%)")

        print()
        print("  Učitavanje regular_prices (barcode, chain)...")
        rp_rows = fetch_paginated(sb, "regular_prices", "barcode, chain")

        print()
        print("  Po lancu (regular_prices — nema slika, samo broj redaka):")
        by_chain: dict[str, int] = defaultdict(int)
        for r in rp_rows:
            by_chain[r.get("chain") or "?"] += 1
        print(f"  {'lanac':<14} {'n':>7}  {'s slikom':>10}  {'postotak':>8}")
        for chain in sorted(by_chain.keys(), key=lambda c: (-by_chain[c], c)):
            print(f"  {chain:<14} {by_chain[chain]:>7}  {'0':>10}  {'0.0%':>8}")

        print()

    check_barcode_overlap(sb, rp_rows)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
