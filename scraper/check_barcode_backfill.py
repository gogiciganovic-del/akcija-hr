#!/usr/bin/env python3
"""
READ-ONLY: procjena backfilla products.barcode iz regular_prices / active_deals.

  cd scraper
  py -3 check_barcode_backfill.py

Ne piše u bazu.
"""

from __future__ import annotations

import os
import sys
from collections import defaultdict
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

from check_image_coverage import (
    PAGE,
    fetch_paginated,
    normalize_barcode,
    pct,
    sb_client,
)
from link_product_barcodes import (
    MIN_BC,
    build_catalog_index,
    chain_from_store_name,
    classify_deal,
    fetch_active_deals,
    normalize_deal_name_key,
    prices_ok,
)

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT.parent / ".env")
load_dotenv(ROOT / ".env")


def fetch_products(sb) -> list[dict]:
    return fetch_paginated(sb, "products", "id, name, barcode, image_url")


def fetch_deals_product_store(sb) -> list[dict]:
    """deals → product_id + store chain (aktivni i neaktivni)."""
    rows = fetch_paginated(sb, "deals", "product_id, store_id, is_active")
    stores = {
        s["id"]: s.get("chain")
        for s in fetch_paginated(sb, "stores", "id, chain, name")
    }
    out = []
    for d in rows:
        chain = stores.get(d.get("store_id"))
        if not chain or not d.get("product_id"):
            continue
        out.append(
            {
                "product_id": d["product_id"],
                "chain": chain,
                "is_active": bool(d.get("is_active")),
            }
        )
    return out


def product_chain_keys(products: list[dict], deal_rows: list[dict]) -> dict[str, set[tuple[str, str]]]:
    """product_id → {(chain, normalize_deal_name_key)} iz svih dealova."""
    name_by_id = {p["id"]: (p.get("name") or "").strip() for p in products}
    out: dict[str, set[tuple[str, str]]] = defaultdict(set)
    for d in deal_rows:
        chain = d.get("chain")
        if not chain:
            continue
        pid = d["product_id"]
        name = name_by_id.get(pid, "")
        key = normalize_deal_name_key(name)
        if not key:
            continue
        out[pid].add((d["chain"], key))
    return out


def match_product_to_barcode(
    pid: str,
    chain_keys: set[tuple[str, str]],
    catalog_index: dict[tuple[str, str], list[dict]],
    *,
    require_unique: bool = True,
    require_price_ok: bool = False,
    deal_prices: dict[str, float | None] | None = None,
) -> str | None:
    """Vrati barkod ili None."""
    candidates: set[str] = set()
    for chain, key in chain_keys:
        rows = catalog_index.get((chain, key)) or []
        by_code: dict[str, dict] = {}
        for r in rows:
            by_code[r["barcode"]] = r
        codes = list(by_code.keys())
        if require_unique and len(codes) != 1:
            continue
        for code in codes:
            if require_price_ok and deal_prices is not None:
                dp = deal_prices.get(pid)
                cp = by_code[code]["price"]
                if not prices_ok(dp, cp):
                    continue
            candidates.add(code)
    if len(candidates) == 1:
        return next(iter(candidates))
    return None


def overlap_stats(
    rp_rows: list[dict],
    products_by_bc: dict[str, bool],
) -> dict:
    rp_barcodes: set[str] = set()
    rows_with_image = 0
    for row in rp_rows:
        bc = normalize_barcode(row.get("barcode"))
        if not bc:
            continue
        rp_barcodes.add(bc)
        if bc in products_by_bc and products_by_bc[bc]:
            rows_with_image += 1
    distinct_overlap = len(rp_barcodes & set(products_by_bc.keys()))
    distinct_overlap_img = len(
        {bc for bc in rp_barcodes if products_by_bc.get(bc)}
    )
    return {
        "rp_rows": len(rp_rows),
        "rp_distinct_bc": len(rp_barcodes),
        "products_distinct_bc": len(products_by_bc),
        "distinct_overlap": distinct_overlap,
        "distinct_overlap_pct": distinct_overlap,
        "distinct_overlap_img": distinct_overlap_img,
        "rows_with_image": rows_with_image,
    }


def print_overlap(label: str, stats: dict, baseline_rows_img: int) -> None:
    rp_rows = stats["rp_rows"] or 1
    rp_dist = stats["rp_distinct_bc"] or 1
    print(f"  {label}")
    print(
        f"    products s barkodom:        {stats['products_distinct_bc']} "
        f"(+{stats['products_distinct_bc'] - baseline_products_bc} vs sada)"
    )
    print(
        f"    overlap DISTINCT RP:        {stats['distinct_overlap']}/{rp_dist} "
        f"({pct(stats['distinct_overlap'], rp_dist)})"
    )
    print(
        f"    overlap + slika DISTINCT:   {stats['distinct_overlap_img']}/{rp_dist} "
        f"({pct(stats['distinct_overlap_img'], rp_dist)})"
    )
    print(
        f"    RP redaka s products slikom: {stats['rows_with_image']}/{rp_rows} "
        f"({pct(stats['rows_with_image'], rp_rows)}) "
        f"[prije: {pct(baseline_rows_img, rp_rows)}]"
    )


def main() -> int:
    global baseline_products_bc
    sb = sb_client()

    print("=== JOIN putevi (schema) ===")
    print("  products ──< deals >── stores.chain")
    print("  active_deals = deals + products + stores (view)")
    print("  regular_prices: (chain, barcode, name) — NEMA FK na products.id")
    print("  regular_prices.product_id = interni ID lanca u cjeniku, NE uuid products")
    print("  Najbolji spoj: (stores.chain, normalize_deal_name_key(name)) ≈ (rp.chain, normalize_deal_name_key(rp.name))")
    print("  Postojeći alat: link_product_barcodes.py (--dry-run)")
    print()

    products = fetch_products(sb)
    rp_rows = fetch_paginated(sb, "regular_prices", "barcode, chain, product_id")
    catalog_index = build_catalog_index(sb)
    deal_rows = fetch_deals_product_store(sb)
    active_deals = fetch_active_deals(sb)

    total_products = len(products)
    with_bc_now = sum(1 for p in products if normalize_barcode(p.get("barcode")))
    without_bc = [p for p in products if not normalize_barcode(p.get("barcode"))]

    print("=== Trenutno stanje products ===")
    print(f"  Ukupno products:           {total_products}")
    print(f"  S barcode:                 {with_bc_now} ({pct(with_bc_now, total_products)})")
    print(f"  Bez barcode:               {len(without_bc)} ({pct(len(without_bc), total_products)})")
    print()

    # Baseline overlap
    products_by_bc: dict[str, bool] = {}
    for p in products:
        bc = normalize_barcode(p.get("barcode"))
        if not bc:
            continue
        img = bool((p.get("image_url") or "").strip())
        products_by_bc[bc] = products_by_bc.get(bc, False) or img

    baseline = overlap_stats(rp_rows, products_by_bc)
    baseline_products_bc = baseline["products_distinct_bc"]
    baseline_rows_img = baseline["rows_with_image"]

    print("=== Overlap PRIJE backfilla (baseline) ===")
    print_overlap("baseline", baseline, baseline_rows_img)
    print()

    # --- Strategija A: link_product_barcodes (active deals, unique + price_ok) ---
    print("=== Strategija A: active_deals → RP (unique + price guard) ===")
    print("  Isto kao link_product_barcodes.py --dry-run")
    classified = [classify_deal(d, catalog_index) for d in active_deals]
    unique_a = [r for r in classified if r["status"] == "unique"]
    product_ids_a = {
        r["product_id"]: r["catalog_barcode"]
        for r in unique_a
        if r.get("product_id") and not r.get("existing_barcode")
    }
    print(f"  Active deals:              {len(active_deals)}")
    print(f"  unique (would backfill):   {len(product_ids_a)} product_id → barcode")
    for status in ("none", "ambiguous", "rejected_price", "skip"):
        n = sum(1 for r in classified if r["status"] == status)
        print(f"  {status}:{' ' * (22 - len(status))}{n}")

    sim_a = dict(products_by_bc)
    img_by_id = {
        p["id"]: bool((p.get("image_url") or "").strip()) for p in products
    }
    for pid, bc in product_ids_a.items():
        sim_a[bc] = sim_a.get(bc, False) or img_by_id.get(pid, False)
    stats_a = overlap_stats(rp_rows, sim_a)
    print()
    print_overlap("nakon strategije A", stats_a, baseline_rows_img)
    print()

    # --- Strategija B: active deals, unique ONLY (bez price guard) ---
    print("=== Strategija B: active_deals → RP (unique, BEZ price guard) ===")
    product_ids_b: dict[str, str] = {}
    for d in active_deals:
        if normalize_barcode(d.get("barcode")):
            continue
        pid = d.get("product_id")
        chain = chain_from_store_name(d.get("store_name"))
        key = normalize_deal_name_key(d.get("name") or "")
        if not pid or not chain or not key:
            continue
        rows = catalog_index.get((chain, key)) or []
        codes = {r["barcode"] for r in rows}
        if len(codes) == 1:
            product_ids_b[pid] = next(iter(codes))
    print(f"  Would backfill:            {len(product_ids_b)} products")
    sim_b = dict(products_by_bc)
    for pid, bc in product_ids_b.items():
        sim_b[bc] = sim_b.get(bc, False) or img_by_id.get(pid, False)
    stats_b = overlap_stats(rp_rows, sim_b)
    print_overlap("nakon strategije B", stats_b, baseline_rows_img)
    print()

    # --- Strategija C: svi products s bilo kojim dealom, unique match ---
    print("=== Strategija C: bilo koji deal (aktivni+neaktivni) → RP, unique ===")
    pch = product_chain_keys(products, deal_rows)
    product_ids_c: dict[str, str] = {}
    for p in without_bc:
        pid = p["id"]
        bc = match_product_to_barcode(
            pid, pch.get(pid, set()), catalog_index, require_unique=True
        )
        if bc:
            product_ids_c[pid] = bc
    print(f"  Products s dealom:         {len(pch)}")
    print(f"  Would backfill:            {len(product_ids_c)} products "
          f"({pct(len(product_ids_c), total_products)} svih products)")
    sim_c = dict(products_by_bc)
    for pid, bc in product_ids_c.items():
        sim_c[bc] = sim_c.get(bc, False) or img_by_id.get(pid, False)
    stats_c = overlap_stats(rp_rows, sim_c)
    print_overlap("nakon strategije C", stats_c, baseline_rows_img)
    print()

    # --- Strategija D: migration 009 stil — lower(trim(name)), active deals only ---
    print("=== Strategija D: migracija 009 stil (lower(trim name)), active deal, unique ===")
    active_pch = product_chain_keys(
        products,
        [d for d in deal_rows if d["is_active"]],
    )
    # rebuild keys with simple lower trim instead of normalize
    simple_keys: dict[str, set[tuple[str, str]]] = defaultdict(set)
    name_by_id = {p["id"]: (p.get("name") or "").strip() for p in products}
    for d in deal_rows:
        if not d.get("chain"):
            continue
        if not d["is_active"]:
            continue
        pid = d["product_id"]
        key = name_by_id.get(pid, "").lower().strip()
        if key:
            simple_keys[pid].add((d["chain"], key))

    simple_index: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for (chain, key), rows in catalog_index.items():
        # also index by simple lower(trim) of catalog names
        for r in rows:
            simple_key = (r.get("name") or "").lower().strip()
            simple_index[(chain, simple_key)].append(r)

    product_ids_d: dict[str, str] = {}
    for p in without_bc:
        pid = p["id"]
        candidates: set[str] = set()
        for chain, skey in simple_keys.get(pid, set()):
            rows = simple_index.get((chain, skey)) or []
            codes = {r["barcode"] for r in rows}
            if len(codes) == 1:
                candidates |= codes
        if len(candidates) == 1:
            product_ids_d[pid] = next(iter(candidates))
    print(f"  Would backfill:            {len(product_ids_d)} products")
    sim_d = dict(products_by_bc)
    for pid, bc in product_ids_d.items():
        sim_d[bc] = sim_d.get(bc, False) or img_by_id.get(pid, False)
    stats_d = overlap_stats(rp_rows, sim_d)
    print_overlap("nakon strategije D", stats_d, baseline_rows_img)
    print()

    # --- Strategija E: regular_prices.product_id == products.id (uuid)? ---
    print("=== Strategija E: regular_prices.product_id = products.id (uuid) ===")
    product_uuids = {p["id"] for p in products}
    rp_pid_match = 0
    for r in rp_rows:
        pid = (r.get("product_id") or "").strip()
        if pid in product_uuids:
            rp_pid_match += 1
    print(f"  RP redaka s product_id=products.id: {rp_pid_match} (očekivano ~0)")
    print()

    # --- Sažetak ---
    print("=== SAŽETAK ===")
    print(f"  {'Strategija':<42} {'backfill products':>18}  {'RP rows +slika':>14}")
    for label, n, st in [
        ("A: active + unique + price (preporučeno)", len(product_ids_a), stats_a),
        ("B: active + unique", len(product_ids_b), stats_b),
        ("C: svi dealovi + unique", len(product_ids_c), stats_c),
        ("D: migr.009 simple name", len(product_ids_d), stats_d),
    ]:
        print(
            f"  {label:<42} {n:>18}  "
            f"{pct(st['rows_with_image'], st['rp_rows']):>14}"
        )
    print()
    print(
        f"  Baseline overlap RP redaka: {pct(baseline_rows_img, baseline['rp_rows'])} → "
        f"najbolje (A): {pct(stats_a['rows_with_image'], stats_a['rp_rows'])}"
    )
    print(
        f"  Products s barcode nakon A: {with_bc_now + len(product_ids_a)}/{total_products} "
        f"({pct(with_bc_now + len(product_ids_a), total_products)})"
    )

    return 0


baseline_products_bc = 0

if __name__ == "__main__":
    raise SystemExit(main())
