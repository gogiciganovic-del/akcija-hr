#!/usr/bin/env python3
"""
Uvoz trenutnih redovnih cijena iz CSV izlaza senko/cijene-api crawlera.

Očekivana struktura:
  <input>/<chain>/products.csv
  <input>/<chain>/prices.csv

Agregira min(price) po (barcode, chain) i upserta u Supabase tablicu regular_prices.
Prije upserta detektira promjene gramaže → product_size_history (šrinkflacija).
"""

from __future__ import annotations

import argparse
import csv
import os
import re
import sys
from collections import defaultdict
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
# Zanemari sitne razlike (zaokruživanje / parser šum)
MIN_QTY_CHANGE_RATIO = 0.02
_EAN_RE = re.compile(r"^\d{8,14}$")


def open_csv(path: Path):
    """Otvori CSV (utf-8 ili cp1250 — cijene-api ponekad piše Windows encoding)."""
    raw = path.read_bytes()
    for enc in ("utf-8-sig", "utf-8", "cp1250", "latin-1"):
        try:
            text = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    else:
        text = raw.decode("utf-8", errors="replace")
    from io import StringIO

    return csv.DictReader(StringIO(text))


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


def is_stable_ean(barcode: str | None) -> bool:
    """Pravi EAN: 8–14 znamenki, bez internih šifara (npr. konzum:90349186)."""
    code = str(barcode or "").strip()
    if not code or ":" in code:
        return False
    return bool(_EAN_RE.match(code))


def load_products(path: Path) -> dict[str, dict]:
    """product_id → product row."""
    products: dict[str, dict] = {}
    reader = open_csv(path)
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

    reader = open_csv(prices_path)
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


def fetch_existing_qty(
    client, rows: list[dict]
) -> dict[tuple[str, str], dict]:
    """Map (chain, barcode) → {quantity_value, quantity_unit, name, price} iz baze."""
    by_chain: dict[str, set[str]] = defaultdict(set)
    for row in rows:
        bc = row.get("barcode")
        ch = row.get("chain")
        if ch and is_stable_ean(bc):
            by_chain[ch].add(str(bc).strip())

    out: dict[tuple[str, str], dict] = {}
    for chain, barcodes in by_chain.items():
        codes = sorted(barcodes)
        for i in range(0, len(codes), BATCH_SIZE):
            chunk = codes[i : i + BATCH_SIZE]
            res = (
                client.table("regular_prices")
                .select("barcode, chain, quantity_value, quantity_unit, name, price")
                .eq("chain", chain)
                .in_("barcode", chunk)
                .execute()
            )
            for r in res.data or []:
                key = (r["chain"], str(r["barcode"]).strip())
                out[key] = r
    return out


def qty_change_significant(old_q: float, new_q: float) -> bool:
    if old_q <= 0 or new_q <= 0:
        return False
    return abs(new_q - old_q) / old_q >= MIN_QTY_CHANGE_RATIO


def detect_size_changes(
    incoming: list[dict], existing: dict[tuple[str, str], dict]
) -> list[dict]:
    """Usporedi dolazeće retke s bazom → retci za product_size_history."""
    changes: list[dict] = []
    for row in incoming:
        barcode = str(row.get("barcode") or "").strip()
        chain = row.get("chain")
        if not chain or not is_stable_ean(barcode):
            continue

        new_q = row.get("quantity_value")
        new_u = row.get("quantity_unit")
        if new_q is None or not new_u:
            continue
        # Marker '' iz backfilla = nije prava jedinica
        if new_u == "":
            continue

        prev = existing.get((chain, barcode))
        if not prev:
            continue

        old_q = prev.get("quantity_value")
        old_u = prev.get("quantity_unit")
        if old_q is None or not old_u or old_u == "":
            continue
        if str(old_u) != str(new_u):
            continue

        try:
            old_f = float(old_q)
            new_f = float(new_q)
        except (TypeError, ValueError):
            continue

        if not qty_change_significant(old_f, new_f):
            continue

        old_price = prev.get("price")
        try:
            old_price_f = float(old_price) if old_price is not None else None
        except (TypeError, ValueError):
            old_price_f = None

        changes.append(
            {
                "barcode": barcode,
                "chain": chain,
                "old_quantity": old_f,
                "new_quantity": new_f,
                "unit": str(new_u),
                "old_name": prev.get("name"),
                "new_name": row.get("name"),
                "old_price": old_price_f,
                "new_price": row.get("price"),
            }
        )
    return changes


def insert_size_history(client, changes: list[dict]) -> int:
    if not changes:
        return 0
    total = 0
    for i in range(0, len(changes), BATCH_SIZE):
        batch = changes[i : i + BATCH_SIZE]
        client.table("product_size_history").insert(batch).execute()
        total += len(batch)
    return total


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
    client = create_client(url.strip().strip('"'), key.strip().strip('"'))

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

    print(f"Comparing quantities for size-change detection ({len(deduped)} rows) ...")
    existing = fetch_existing_qty(client, deduped)
    changes = detect_size_changes(deduped, existing)
    by_chain_counts: dict[str, int] = defaultdict(int)
    for c in changes:
        by_chain_counts[c["chain"]] += 1

    if changes:
        try:
            n = insert_size_history(client, changes)
            print(f"product_size_history: inserted {n} size change(s)")
        except Exception as e:
            print(
                f"WARN: product_size_history insert failed ({e}). "
                "Primijeni migraciju 013 u Supabase SQL Editoru.",
                file=sys.stderr,
            )
    else:
        print("product_size_history: 0 size changes (očekivano na prvom prolazu / isti snapshot)")

    print("Size changes by chain:")
    if by_chain_counts:
        for chain in sorted(by_chain_counts.keys()):
            print(f"  {chain}: {by_chain_counts[chain]}")
    else:
        print("  (none)")

    print(f"Upserting {len(deduped)} rows into regular_prices ...")
    upsert_batches(client, deduped)
    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
