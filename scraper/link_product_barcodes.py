#!/usr/bin/env python3
"""
Poveži products.barcode iz regular_prices za aktivne akcije.

Pravila (isto kao mjerenje + ručni review):
  - normalizeDealNameKey: strip „Akcija u trgovini …“ + lower + spaces
  - isti lanac
  - točno 1 različiti barkod (len >= 8), inače preskoči
  - cijene: odbaci ako akcija > katalog, ili max/min >= 3 (Maasdam-tip)

Pokreće se automatski nakon scrape importa, ili ručno:

  cd scraper && python link_product_barcodes.py
  cd scraper && python link_product_barcodes.py --dry-run
  cd scraper && python link_product_barcodes.py --verify-approved
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent
load_dotenv(REPO / ".env")
load_dotenv(ROOT / ".env")

URL = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY")
PAGE = 1000
MIN_BC = 8
# Omjer cijena: odbaci ako max/min >= ovaj prag (npr. 0.69 vs 9.99).
MAX_PRICE_RATIO = 3.0
FLYER_SUFFIX_RE = re.compile(r"\s+akcija\s+u\s+trgovini\s+.+$", re.IGNORECASE)

# Ručno odbačeni u reviewu (za --verify-approved)
REJECT_STRIPPED = {
    "Sir Maasdam",
    "Kinder Pingui cocco 30 g",
}


def strip_deal_name_suffix(name: str) -> str:
    return FLYER_SUFFIX_RE.sub("", str(name or "")).strip()


def normalize_deal_name_key(name: str) -> str:
    return re.sub(r"\s+", " ", strip_deal_name_suffix(name).lower()).strip()


def parse_price(v) -> float | None:
    try:
        n = float(v)
    except (TypeError, ValueError):
        return None
    if n != n:  # NaN
        return None
    return n


def prices_ok(deal_price: float | None, catalog_price: float | None) -> bool:
    """False → ne upisuj (Kinder: akcija > katalog; Maasdam: absurdan omjer)."""
    if deal_price is None or catalog_price is None:
        return True  # bez cijene ne odbijamo samo zbog toga
    if deal_price <= 0 or catalog_price <= 0:
        return True
    # Akcijska ne smije biti viša od kataloške (prava akcija).
    if deal_price > catalog_price * 1.001:
        return False
    hi = max(deal_price, catalog_price)
    lo = min(deal_price, catalog_price)
    if lo <= 0:
        return False
    if hi / lo >= MAX_PRICE_RATIO:
        return False
    return True


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


def fetch_active_deals(sb) -> list[dict]:
    rows = []
    start = 0
    while True:
        chunk = (
            sb.table("active_deals")
            .select(
                "deal_id, product_id, name, barcode, store_name, price, original_price"
            )
            .range(start, start + PAGE - 1)
            .execute()
            .data
            or []
        )
        rows.extend(chunk)
        if len(chunk) < PAGE:
            break
        start += PAGE
    return rows


def chain_from_store_name(store_name: str | None) -> str | None:
    """Isti prioritet duljine kao u src/lib/constants.js (Interspar prije Spar)."""
    if not store_name:
        return None
    lower = store_name.lower().strip()
    chains = [
        "Interspar",
        "Kaufland",
        "Eurospin",
        "Studenac",
        "Plodine",
        "Konzum",
        "Tommy",
        "Mueller",
        "Lidl",
        "Spar",
        "Bipa",
        "Dm",
    ]
    for c in chains:
        if lower.startswith(c.lower()):
            return c
    for c in chains:
        if len(c) >= 3 and c.lower() in lower:
            return c
    return None


def build_catalog_index(sb) -> dict[tuple[str, str], list[dict]]:
    """(chain, normalize_key) → [{barcode, name, price}, ...]"""
    regs = fetch_all(sb, "regular_prices", "name, chain, barcode, price")
    index: dict[tuple[str, str], list[dict]] = {}
    for r in regs:
        name = (r.get("name") or "").strip()
        chain = (r.get("chain") or "").strip()
        bc = (r.get("barcode") or "").strip()
        if not name or not chain or len(bc) < MIN_BC:
            continue
        key = normalize_deal_name_key(name)
        if not key:
            continue
        index.setdefault((chain, key), []).append(
            {
                "barcode": bc,
                "name": name,
                "price": parse_price(r.get("price")),
            }
        )
    return index


def classify_deal(deal: dict, catalog_index: dict) -> dict:
    name = (deal.get("name") or "").strip()
    chain = chain_from_store_name(deal.get("store_name"))
    key = normalize_deal_name_key(name)
    stripped = strip_deal_name_suffix(name)
    deal_price = parse_price(deal.get("price"))
    existing = (deal.get("barcode") or "").strip() or None
    if existing and len(existing) < MIN_BC:
        existing = None

    base = {
        "deal_id": deal.get("deal_id"),
        "product_id": deal.get("product_id"),
        "chain": chain,
        "deal_name": name,
        "deal_stripped": stripped,
        "deal_price": deal_price,
        "existing_barcode": existing,
    }

    if not chain or not key or not deal.get("product_id"):
        return {**base, "status": "skip", "reason": "no_chain_or_key"}

    rows = catalog_index.get((chain, key)) or []
    by_code: dict[str, dict] = {}
    for r in rows:
        bc = r["barcode"]
        if bc not in by_code:
            by_code[bc] = r
        else:
            # zadrži jeftiniji katalog red za omjer
            prev = by_code[bc]
            p_new = r["price"]
            p_old = prev["price"]
            if p_new is not None and (p_old is None or p_new < p_old):
                by_code[bc] = r

    codes = list(by_code.keys())
    if len(codes) == 0:
        return {**base, "status": "none", "reason": "no_match"}
    if len(codes) > 1:
        return {
            **base,
            "status": "ambiguous",
            "reason": "multiple_barcodes",
            "barcodes": codes,
            "catalog_examples": [
                {
                    "barcode": c,
                    "name": by_code[c]["name"],
                    "price": by_code[c]["price"],
                }
                for c in codes[:4]
            ],
        }

    cat = by_code[codes[0]]
    if not prices_ok(deal_price, cat["price"]):
        return {
            **base,
            "status": "rejected_price",
            "reason": "price_guard",
            "catalog_barcode": cat["barcode"],
            "catalog_name": cat["name"],
            "catalog_price": cat["price"],
        }

    return {
        **base,
        "status": "unique",
        "catalog_barcode": cat["barcode"],
        "catalog_name": cat["name"],
        "catalog_price": cat["price"],
    }


def evaluate_all(sb) -> list[dict]:
    deals = fetch_active_deals(sb)
    catalog_index = build_catalog_index(sb)
    return [classify_deal(d, catalog_index) for d in deals]


def link_active_deal_barcodes(
    sb=None, *, dry_run: bool = False, only_null: bool = True
) -> dict:
    """
    Upis products.barcode za unique+price_ok kandidate.
    only_null=True: ne pregazi postojeći barkod.
    """
    own_client = False
    if sb is None:
        if not URL or not KEY:
            raise RuntimeError("Nedostaje SUPABASE_URL / service role key")
        sb = create_client(URL, KEY)
        own_client = True

    results = evaluate_all(sb)
    unique = [r for r in results if r["status"] == "unique"]
    rejected_price = [r for r in results if r["status"] == "rejected_price"]
    ambiguous = [r for r in results if r["status"] == "ambiguous"]
    none = [r for r in results if r["status"] == "none"]

    updated = 0
    already = 0
    skipped_has = 0
    errors = 0

    for r in unique:
        pid = r["product_id"]
        bc = r["catalog_barcode"]
        existing = r.get("existing_barcode")
        if existing:
            if existing == bc:
                already += 1
            else:
                skipped_has += 1
            continue
        if only_null is False:
            pass
        if dry_run:
            updated += 1
            r["write"] = "would_update"
            continue
        try:
            sb.table("products").update({"barcode": bc}).eq("id", pid).is_(
                "barcode", "null"
            ).execute()
            # verify
            check = (
                sb.table("products")
                .select("barcode")
                .eq("id", pid)
                .limit(1)
                .execute()
                .data
                or []
            )
            got = (check[0].get("barcode") or "").strip() if check else ""
            if got == bc:
                updated += 1
                r["write"] = "updated"
            else:
                # već netko drugi upisao ili RLS
                if got:
                    already += 1
                    r["write"] = "already_other"
                else:
                    errors += 1
                    r["write"] = "verify_fail"
        except Exception as exc:
            errors += 1
            r["write"] = f"error:{exc}"

    stats = {
        "deals": len(results),
        "unique": len(unique),
        "rejected_price": len(rejected_price),
        "ambiguous": len(ambiguous),
        "none": len(none),
        "updated": updated,
        "already_ok": already,
        "skipped_other_barcode": skipped_has,
        "errors": errors,
        "dry_run": dry_run,
    }
    # keep reference for callers / tests
    stats["_unique"] = unique
    stats["_rejected_price"] = rejected_price
    stats["_ambiguous"] = ambiguous
    return stats


def verify_against_approved(stats: dict, measure_path: Path) -> int:
    """
    Usporedi unique-after-price-guards s ručno odobrenom listom.
    Očekuje: 40 unique (bez Maasdam/Kinder), ista 2 u rejected_price.
    """
    if not measure_path.exists():
        print(f"Nema {measure_path} — skip stroge usporedbe, samo brojke.")
        ok = (
            len(stats["_unique"]) == 40
            and len(stats["_rejected_price"]) == 2
        )
        print("unique", len(stats["_unique"]), "rejected_price", len(stats["_rejected_price"]))
        for r in stats["_rejected_price"]:
            print("  reject:", r.get("deal_stripped"), r.get("catalog_barcode"))
        return 0 if ok else 1

    measure = json.loads(measure_path.read_text(encoding="utf-8"))
    approved = [
        u
        for u in measure.get("allUnique") or []
        if u.get("dealStripped") not in REJECT_STRIPPED
    ]
    approved_keys = {
        (u["chain"], normalize_deal_name_key(u["dealStripped"]), u["catalogBarcode"])
        for u in approved
    }
    got_keys = {
        (
            r["chain"],
            normalize_deal_name_key(r["deal_stripped"]),
            r["catalog_barcode"],
        )
        for r in stats["_unique"]
    }

    missing = approved_keys - got_keys
    extra = got_keys - approved_keys
    reject_stripped = {r.get("deal_stripped") for r in stats["_rejected_price"]}

    print("=== VERIFY ===")
    print(f"approved expected: {len(approved_keys)}")
    print(f"unique now:       {len(got_keys)}")
    print(f"rejected_price:   {len(stats['_rejected_price'])} → {sorted(reject_stripped)}")
    print(f"ambiguous:        {len(stats['_ambiguous'])}")
    if missing:
        print("MISSING from new logic:", len(missing))
        for m in sorted(missing)[:20]:
            print(" ", m)
    if extra:
        print("EXTRA vs approved:", len(extra))
        for m in sorted(extra)[:20]:
            print(" ", m)

    expect_rejects = REJECT_STRIPPED
    rejects_ok = expect_rejects <= reject_stripped or expect_rejects == reject_stripped
    # stripped may include full name; check containment
    rejects_ok = all(
        any(rs == e or rs.startswith(e) for rs in reject_stripped)
        for e in expect_rejects
    ) or reject_stripped == expect_rejects

    # softer: both Maasdam and Kinder must appear in rejected
    has_maasdam = any("Maasdam" in (r or "") for r in reject_stripped)
    has_kinder = any("Kinder Pingui cocco" in (r or "") for r in reject_stripped)

    ok = (
        len(missing) == 0
        and len(extra) == 0
        and has_maasdam
        and has_kinder
        and len(stats["_unique"]) == 40
    )
    print("RESULT:", "OK" if ok else "MISMATCH")
    return 0 if ok else 1


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Ne upisuj, samo klasificiraj / broji",
    )
    parser.add_argument(
        "--verify-approved",
        action="store_true",
        help="Usporedi unique kandidate s ručno odobrenih 40",
    )
    args = parser.parse_args()

    if not URL or not KEY:
        print("Nedostaje SUPABASE_URL / service role key u .env")
        return 1

    sb = create_client(URL, KEY)
    # Za verify uvijek dry-run klasifikacija (ne dira već upisane)
    dry = args.dry_run or args.verify_approved
    stats = link_active_deal_barcodes(sb, dry_run=dry)

    print(
        f"Deals: {stats['deals']} | unique: {stats['unique']} | "
        f"rejected_price: {stats['rejected_price']} | "
        f"ambiguous: {stats['ambiguous']} | none: {stats['none']}"
    )
    print(
        f"Write: updated={stats['updated']} already_ok={stats['already_ok']} "
        f"skipped_other={stats['skipped_other_barcode']} errors={stats['errors']} "
        f"dry_run={stats['dry_run']}"
    )
    for r in stats["_rejected_price"]:
        print(
            f"  price-reject: [{r.get('chain')}] {r.get('deal_stripped')} "
            f"deal={r.get('deal_price')} cat={r.get('catalog_price')} "
            f"bc={r.get('catalog_barcode')}"
        )

    if args.verify_approved:
        measure_path = REPO / "_tmp_deal_barcode_map.json"
        return verify_against_approved(stats, measure_path)
    return 0 if stats["errors"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
