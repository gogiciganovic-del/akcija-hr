#!/usr/bin/env python3
"""
Uvoz trenutnih redovnih cijena iz CSV izlaza senko/cijene-api crawlera.

Očekivana struktura:
  <input>/<chain>/products.csv
  <input>/<chain>/prices.csv

Agregira min(price) po (barcode, chain) i upserta u Supabase tablicu regular_prices.
"""

from __future__ import annotations

import argparse
import csv
import os
import sys
from decimal import Decimal, InvalidOperation
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

from quantity_parse import enrich_from_name

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT.parent / ".env")
load_dotenv(ROOT / ".env")

# crawler slug → STORES.id u frontendu
CHAIN_LABEL = {
    "lidl": "Lidl",
    "kaufland": "Kaufland",
    "konzum": "Konzum",
    "spar": "Spar",
    "plodine": "Plodine",
    "eurospin": "Eurospin",
    "tommy": "Tommy",
    "studenac": "Studenac",
    "dm": "Dm",
}

BATCH_SIZE = 500


def parse_decimal(value: str | None) -> Decimal | None:
    if value is None:
        return None
    text = str(value).strip().replace(",", ".")
    if not text:
        return None
    try:
        return Decimal(text)
    except InvalidOperation:
        return None


def load_products(path: Path) -> dict[str, dict]:
    """product_id → product row."""
    products: dict[str, dict] = {}
    with path.open(newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            pid = (row.get("product_id") or "").strip()
            if not pid:
                continue
            barcode = (row.get("barcode") or "").strip() or pid
            products[pid] = {
                "barcode": barcode,
                "product_id": pid,
                "name": (row.get("name") or "").strip(),
                "brand": (row.get("brand") or "").strip() or None,
                "category": (row.get("category") or "").strip() or None,
                "unit": (row.get("unit") or "").strip() or None,
                "quantity": (row.get("quantity") or "").strip() or None,
            }
    return products


def aggregate_chain(chain_slug: str, chain_dir: Path) -> list[dict]:
    products_path = chain_dir / "products.csv"
    prices_path = chain_dir / "prices.csv"
    if not products_path.exists() or not prices_path.exists():
        print(f"  ! skip {chain_slug}: missing CSV in {chain_dir}")
        return []

    label = CHAIN_LABEL.get(chain_slug)
    if not label:
        print(f"  ! skip {chain_slug}: not in CHAIN_LABEL map")
        return []

    products = load_products(products_path)
    # barcode → best row (min price)
    best: dict[str, dict] = {}

    with prices_path.open(newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            pid = (row.get("product_id") or "").strip()
            price = parse_decimal(row.get("price"))
            if not pid or price is None:
                continue
            product = products.get(pid)
            if not product or not product["name"]:
                continue

            barcode = product["barcode"]
            special = parse_decimal(row.get("special_price"))
            unit_price = parse_decimal(row.get("unit_price"))

            prev = best.get(barcode)
            if prev is None or price < prev["_price"]:
                best[barcode] = {
                    "chain": label,
                    "barcode": barcode,
                    "product_id": product["product_id"],
                    "name": product["name"],
                    "brand": product["brand"],
                    "category": product["category"],
                    "unit": product["unit"],
                    "quantity": product["quantity"],
                    "price": float(price),
                    "special_price": float(special) if special is not None else None,
                    "unit_price": float(unit_price) if unit_price is not None else None,
                    "_price": price,
                }

    rows = []
    for item in best.values():
        item.pop("_price", None)
        item.update(enrich_from_name(item.get("name")))
        rows.append(item)
    return rows


def upsert_batches(client, rows: list[dict]) -> int:
    total = 0
    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i : i + BATCH_SIZE]
        client.table("regular_prices").upsert(
            batch, on_conflict="chain,barcode"
        ).execute()
        total += len(batch)
        print(f"  upserted {total}/{len(rows)}")
    return total


def main() -> int:
    parser = argparse.ArgumentParser(description="Import regular prices CSV → Supabase")
    parser.add_argument(
        "--input",
        required=True,
        type=Path,
        help="Folder YYYY-MM-DD with per-chain subdirs (products.csv, prices.csv)",
    )
    parser.add_argument(
        "--chains",
        default="lidl,konzum",
        help="Comma-separated crawler chain slugs (default: lidl,konzum)",
    )
    args = parser.parse_args()

    url = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
    key = (
        os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        or os.getenv("SUPABASE_KEY")
        or os.getenv("VITE_SUPABASE_ANON_KEY")
    )
    if not url or not key:
        print("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY", file=sys.stderr)
        return 1

    if not args.input.is_dir():
        print(f"Input folder not found: {args.input}", file=sys.stderr)
        return 1

    chains = [c.strip().lower() for c in args.chains.split(",") if c.strip()]
    client = create_client(url, key)

    all_rows: list[dict] = []
    for slug in chains:
        chain_dir = args.input / slug
        print(f"Processing {slug} from {chain_dir} ...")
        rows = aggregate_chain(slug, chain_dir)
        print(f"  → {len(rows)} unique barcodes (min price)")
        all_rows.extend(rows)

    if not all_rows:
        print("No rows to import.")
        return 1

    # Deduplicate across accidental overlaps (same chain+barcode)
    by_key: dict[tuple[str, str], dict] = {}
    for row in all_rows:
        key = (row["chain"], row["barcode"])
        prev = by_key.get(key)
        if prev is None or row["price"] < prev["price"]:
            by_key[key] = row
    deduped = list(by_key.values())

    print(f"Upserting {len(deduped)} rows into regular_prices ...")
    upsert_batches(client, deduped)
    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
