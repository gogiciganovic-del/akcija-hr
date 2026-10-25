#!/usr/bin/env python3
"""
Detekcija „novi letak” po lancu (samo čitanje).

--dry-run (obavezno u Fazi 0): čita deals+stores, ispisuje FLYER_STATS.
Ne piše u bazu, ne šalje push, ne koristi VAPID.

Pokreni: python scraper/detect_new_flyers.py --dry-run
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections import defaultdict
from datetime import date, datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT.parent / ".env")
load_dotenv(ROOT / ".env")

sys.path.insert(0, str(ROOT))
from flyer_detect_lib import (  # noqa: E402
    WINDOW_DAYS,
    count_new,
    iso_week_key,
    prev_window_days,
    should_fire,
    threshold_for_today,
    utc_day,
)

FETCH_BATCH = 1000


def configure_stdio() -> None:
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            try:
                reconfigure(encoding="utf-8", errors="replace")
            except (OSError, ValueError):
                pass


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Detect new flyers (read-only).")
    p.add_argument(
        "--dry-run",
        action="store_true",
        required=True,
        help="Obavezno: samo čitaj i logiraj (nema pisanja).",
    )
    p.add_argument(
        "--as-of",
        help="UTC datum YYYY-MM-DD (default: danas UTC). Za replay.",
    )
    p.add_argument(
        "--batch-size",
        type=int,
        default=FETCH_BATCH,
        help=f"Stranica fetcha (default {FETCH_BATCH}).",
    )
    return p.parse_args()


def supabase_client():
    url = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
    key = (
        os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        or os.getenv("SUPABASE_KEY")
        or os.getenv("VITE_SUPABASE_ANON_KEY")
    )
    if not url or not key:
        print("Missing SUPABASE_URL / key", file=sys.stderr)
        raise SystemExit(1)
    return create_client(url.strip().strip('"'), key.strip().strip('"'))


def emit_flyer_stats(payload: dict) -> None:
    print(f"FLYER_STATS={json.dumps(payload, ensure_ascii=False, separators=(',', ':'))}")
    sys.stdout.flush()


def fetch_stores(client) -> dict[str, str]:
    """store_id -> chain"""
    out: dict[str, str] = {}
    offset = 0
    batch = 500
    while True:
        resp = (
            client.table("stores")
            .select("id,chain")
            .order("id")
            .range(offset, offset + batch - 1)
            .execute()
        )
        rows = resp.data or []
        if not rows:
            break
        for row in rows:
            sid = str(row.get("id") or "")
            chain = str(row.get("chain") or "").strip()
            if sid and chain:
                out[sid] = chain
        if len(rows) < batch:
            break
        offset += batch
    return out


def fetch_scrape_sets(
    client, store_by_id: dict[str, str], batch_size: int
) -> dict[str, dict[date, set[str]]]:
    """
    chain -> { scrape_day -> set(product_id) }
    Samo retci s scraped_at.
    """
    by_chain: dict[str, dict[date, set[str]]] = defaultdict(lambda: defaultdict(set))
    offset = 0
    while True:
        resp = (
            client.table("deals")
            .select("product_id,store_id,scraped_at")
            .not_.is_("scraped_at", "null")
            .order("scraped_at")
            .range(offset, offset + batch_size - 1)
            .execute()
        )
        rows = resp.data or []
        if not rows:
            break
        for row in rows:
            sid = str(row.get("store_id") or "")
            chain = store_by_id.get(sid)
            if not chain:
                continue
            scraped = row.get("scraped_at")
            if not scraped:
                continue
            day = utc_day(scraped)
            pid = str(row.get("product_id") or "").strip()
            if pid:
                by_chain[chain][day].add(pid)
        if len(rows) < batch_size:
            break
        offset += batch_size
    return by_chain


def evaluate_day(
    by_chain: dict[str, dict[date, set[str]]], as_of: date
) -> list[dict]:
    """Za svaki lanac na as_of: brojke + should_fire (s week dedup iz povijesti)."""
    results: list[dict] = []
    for chain in sorted(by_chain.keys()):
        day_map = by_chain[chain]
        today_ids = day_map.get(as_of) or set()
        today_n = len(today_ids)

        prev_ids: set[str] = set()
        for d in prev_window_days(as_of, WINDOW_DAYS):
            prev_ids |= day_map.get(d) or set()
        prev_n = len(prev_ids)
        new_n = count_new(today_ids, prev_ids) if today_n else 0
        thr = threshold_for_today(today_n) if today_n else threshold_for_today(0)

        # Week dedup: je li raniji dan u istom ISO tjednu već "hit"?
        week = iso_week_key(as_of)
        week_already = False
        for earlier, ids in sorted(day_map.items()):
            if earlier >= as_of:
                continue
            if iso_week_key(earlier) != week:
                continue
            e_prev: set[str] = set()
            for d in prev_window_days(earlier, WINDOW_DAYS):
                e_prev |= day_map.get(d) or set()
            e_new = count_new(ids, e_prev)
            e_fire, _ = should_fire(
                today_n=len(ids),
                prev_n=len(e_prev),
                new_n=e_new,
                week_already_fired=False,
            )
            if e_fire:
                week_already = True
                break

        fire, reason = should_fire(
            today_n=today_n,
            prev_n=prev_n,
            new_n=new_n,
            week_already_fired=week_already,
        )
        results.append(
            {
                "chain": chain,
                "as_of": as_of.isoformat(),
                "today_n": today_n,
                "prev_n": prev_n,
                "new_n": new_n,
                "threshold": thr,
                "week": week,
                "week_already_fired": week_already,
                "would_fire": fire,
                "reason": reason,
                "has_scrape_today": today_n > 0,
            }
        )
    return results


def main() -> int:
    configure_stdio()
    args = parse_args()
    if not args.dry_run:
        print("--dry-run je obavezan (Faza 0: bez pisanja).", file=sys.stderr)
        return 2

    if args.as_of:
        try:
            as_of = date.fromisoformat(args.as_of.strip())
        except ValueError as e:
            raise SystemExit(f"Neispravan --as-of: {args.as_of!r} ({e})") from e
    else:
        as_of = datetime.now(timezone.utc).date()

    batch_size = max(1, args.batch_size)
    print(f"detect_new_flyers dry_run=True as_of={as_of.isoformat()} window={WINDOW_DAYS}d")

    client = supabase_client()
    store_by_id = fetch_stores(client)
    print(f"stores: {len(store_by_id)}")
    by_chain = fetch_scrape_sets(client, store_by_id, batch_size)
    print(f"chains_with_scraped_at: {len(by_chain)}")

    rows = evaluate_day(by_chain, as_of)
    fires = [r for r in rows if r["would_fire"]]
    for r in rows:
        print(
            f"  {r['chain']}: today={r['today_n']} prev={r['prev_n']} "
            f"new={r['new_n']} thr={r['threshold']} "
            f"would_fire={r['would_fire']} ({r['reason']})"
        )

    payload = {
        "ok": True,
        "dry_run": True,
        "as_of": as_of.isoformat(),
        "window_days": WINDOW_DAYS,
        "chains": len(rows),
        "would_fire_count": len(fires),
        "would_fire_chains": [r["chain"] for r in fires],
        "rows": rows,
    }
    emit_flyer_stats(payload)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
