#!/usr/bin/env python3
"""
Backfill quantity_value, quantity_unit, product_type na regular_prices.
Zahtijeva migracije 010 + 011 (+ 012 za --types-only partial update).

Nastavljiv (default): radi samo retke gdje quantity_value, product_type i
quantity_unit još nisu dirani (sva tri NULL). Neprepoznati nazivi dobiju
quantity_unit='' kao marker „obrađeno“.

  # Samo tipovi gdje product_type IS NULL (~93k), bez diranja količine:
  python backfill_quantity_type.py --types-only
  python backfill_quantity_type.py --types-only --dry-run

  # Uzorak pokrivenosti tipa (bez pisanja u DB):
  python backfill_quantity_type.py --sample 200
"""

from __future__ import annotations

import argparse
import os
import random
import sys
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

from quantity_parse import enrich_from_name, match_product_type

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT.parent / ".env")
load_dotenv(ROOT / ".env")

PAGE = 1000
BATCH = 800
DONE_EMPTY_UNIT = ""


def fetch_pending_full_page(sb, page_size: int) -> list[dict]:
    """Retci koji još nisu backfillani (sva tri polja NULL)."""
    res = (
        sb.table("regular_prices")
        .select("id, name")
        .is_("quantity_value", "null")
        .is_("product_type", "null")
        .is_("quantity_unit", "null")
        .limit(page_size)
        .execute()
    )
    return res.data or []


def fetch_pending_types_page(sb, page_size: int) -> list[dict]:
    """Samo retci gdje product_type IS NULL (uklj. količinu da je RPC ne obriše)."""
    res = (
        sb.table("regular_prices")
        .select("id, name, quantity_value, quantity_unit")
        .is_("product_type", "null")
        .limit(page_size)
        .execute()
    )
    return res.data or []


def count_pending_full(sb) -> int | None:
    try:
        res = (
            sb.table("regular_prices")
            .select("id", count="exact")
            .is_("quantity_value", "null")
            .is_("product_type", "null")
            .is_("quantity_unit", "null")
            .limit(1)
            .execute()
        )
        return res.count
    except Exception:
        return None


def count_pending_types(sb) -> int | None:
    try:
        res = (
            sb.table("regular_prices")
            .select("id", count="exact")
            .is_("product_type", "null")
            .limit(1)
            .execute()
        )
        return res.count
    except Exception:
        return None


def build_payload_full(rows: list[dict]) -> list[dict]:
    out: list[dict] = []
    for row in rows:
        enriched = enrich_from_name(row.get("name"))
        qv = enriched["quantity_value"]
        qu = enriched["quantity_unit"]
        pt = enriched["product_type"]
        if qv is None and pt is None and qu is None:
            qu = DONE_EMPTY_UNIT
        out.append(
            {
                "id": row["id"],
                "quantity_value": qv,
                "quantity_unit": qu,
                "product_type": pt,
            }
        )
    return out


def rpc_batch_update(sb, batch: list[dict]) -> int:
    res = sb.rpc("backfill_regular_prices_qty", {"rows": batch}).execute()
    n = res.data
    if isinstance(n, int):
        return n
    return len(batch)


def match_product_type_old_first_word(name: str | None) -> str | None:
    """Stara logika (samo prva riječ) — za usporedbu uzorka."""
    from quantity_parse import get_match_map

    if not name:
        return None
    first = str(name).strip().split()[0] if str(name).strip() else ""
    if not first:
        return None
    return get_match_map().get(first.upper())


def run_sample(sb, n: int) -> int:
    """Uzorak ~n naziva: stara vs nova pokrivenost tipa."""
    # Više offseta → manje pristranosti (PostgREST nema random order)
    pool: list[dict] = []
    page = 1000
    for offset in (0, 20000, 50000, 90000, 120000):
        res = (
            sb.table("regular_prices")
            .select("name")
            .not_.is_("name", "null")
            .range(offset, offset + page - 1)
            .execute()
        )
        pool.extend(r for r in (res.data or []) if r.get("name"))
    rows = pool
    if len(rows) > n:
        rows = random.sample(rows, n)

    old_hit = 0
    new_hit = 0
    both = 0
    only_new = 0
    examples_new: list[tuple[str, str]] = []

    for r in rows:
        name = r["name"]
        old_t = match_product_type_old_first_word(name)
        new_t = match_product_type(name)
        if old_t:
            old_hit += 1
        if new_t:
            new_hit += 1
        if old_t and new_t:
            both += 1
        if new_t and not old_t:
            only_new += 1
            if len(examples_new) < 12:
                examples_new.append((name, new_t))

    total = len(rows) or 1
    print(f"Uzorak: {len(rows)} naziva")
    print(f"  Stara (prva riječ):  {old_hit}/{len(rows)} = {100 * old_hit / total:.1f}%")
    print(f"  Nova (sve riječi):   {new_hit}/{len(rows)} = {100 * new_hit / total:.1f}%")
    print(f"  Samo nova pogodila:  {only_new}")
    print(f"  Primjeri koje nova hvata, a stara ne:")
    for name, pt in examples_new:
        print(f"    [{pt}] {name}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--batch-size", type=int, default=BATCH)
    parser.add_argument(
        "--types-only",
        action="store_true",
        help="Samo retci s product_type IS NULL; update samo tip (migracija 012)",
    )
    parser.add_argument(
        "--sample",
        type=int,
        metavar="N",
        help="Procjena pokrivenosti tipa na uzorku N naziva (bez pisanja)",
    )
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

    if args.sample:
        return run_sample(sb, args.sample)

    types_only = args.types_only
    if types_only:
        pending0 = count_pending_types(sb)
        label = "product_type IS NULL"
    else:
        pending0 = count_pending_full(sb)
        label = "full pending (sva 3 NULL)"

    if pending0 is not None:
        print(f"Pending ({label}): {pending0}")
    else:
        print("Pending count: (nije dostupno)")

    written = 0
    with_qty = 0
    with_type = 0
    scanned = 0
    skipped_no_type = 0

    while True:
        if types_only:
            chunk = fetch_pending_types_page(sb, PAGE)
        else:
            chunk = fetch_pending_full_page(sb, PAGE)
        if not chunk:
            break

        scanned += len(chunk)

        if types_only:
            # Bez pogodaka → product_type='' da se ne vrti u krug.
            # quantity_* šaljemo natrag da stari RPC (011) ne obriše količinu.
            payloads = []
            for row in chunk:
                pt = match_product_type(row.get("name"))
                if pt:
                    with_type += 1
                else:
                    pt = ""
                    skipped_no_type += 1
                payloads.append(
                    {
                        "id": row["id"],
                        "quantity_value": row.get("quantity_value"),
                        "quantity_unit": row.get("quantity_unit"),
                        "product_type": pt,
                    }
                )
        else:
            payloads = build_payload_full(chunk)
            for u in payloads:
                if u["quantity_value"] is not None:
                    with_qty += 1
                if u["product_type"]:
                    with_type += 1

        if args.dry_run:
            for u in payloads[:5]:
                print(u)
            print(f"dry-run: would write {len(payloads)} from this page, stopping")
            return 0

        for i in range(0, len(payloads), args.batch_size):
            batch = payloads[i : i + args.batch_size]
            try:
                rpc_batch_update(sb, batch)
            except Exception as e:
                print(f"RPC batch failed ({e}); falling back to per-row UPDATE", file=sys.stderr)
                for u in batch:
                    update = {k: v for k, v in u.items() if k != "id"}
                    sb.table("regular_prices").update(update).eq("id", u["id"]).execute()
            written += len(batch)
            prev = written - len(batch)
            if prev // 5000 != written // 5000 or i + args.batch_size >= len(payloads):
                left = count_pending_types(sb) if types_only else count_pending_full(sb)
                left_s = str(left) if left is not None else "?"
                print(
                    f"progress: written={written}  "
                    f"this_run_scanned={scanned}  "
                    f"with_qty={with_qty} with_type={with_type}  "
                    f"no_type_marked={skipped_no_type}  "
                    f"remaining~{left_s}"
                )

    print(
        f"Done. written={written} scanned={scanned} "
        f"with_qty={with_qty} with_type={with_type} "
        f"no_type_marked={skipped_no_type}"
    )
    left = count_pending_types(sb) if types_only else count_pending_full(sb)
    if left is not None:
        print(f"Remaining pending: {left}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
