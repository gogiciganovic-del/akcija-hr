#!/usr/bin/env python3
"""
Pošalji Web Push notifikacije za padove cijena u price_history.

Čita price_history u vremenskom prozoru (--since ili --lookback-hours),
filtrira new_price < old_price, traži push_subscriptions čiji
tracked_barcodes sadrže taj barkod, pa šalje preko pywebpush.

Ne dira import_regular_prices.py — pokreće se kao zaseban korak nakon importa.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT.parent / ".env")
load_dotenv(ROOT / ".env")

FETCH_BATCH = 500
SUB_BARCODE_CHUNK = 200
DEFAULT_URL = "#favorites"


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Send Web Push for price drops in price_history."
    )
    p.add_argument(
        "--since",
        help="ISO-8601 UTC lower bound for price_history.detected_at "
        "(npr. 2026-08-26T20:00:00Z). Preferirano u CI.",
    )
    p.add_argument(
        "--lookback-hours",
        type=float,
        help="Umjesto --since: uzmi padove iz zadnjih N sati (lokalni test).",
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Ne šalji push — samo logiraj što bi se poslalo.",
    )
    p.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Maksimalan broj notifikacija (npr. --limit 1 za prvi pravi test).",
    )
    p.add_argument(
        "--batch-size",
        type=int,
        default=FETCH_BATCH,
        help=f"Veličina stranice za fetch (default {FETCH_BATCH}).",
    )
    p.add_argument(
        "--checkpoint",
        type=Path,
        help="Opcionalni JSON file za resume (preskače već poslane job keyeve).",
    )
    return p.parse_args()


def resolve_since(args: argparse.Namespace) -> datetime:
    if args.since and args.lookback_hours is not None:
        raise SystemExit("Koristi samo jedno: --since ILI --lookback-hours.")
    if args.since:
        raw = args.since.strip().replace("Z", "+00:00")
        try:
            dt = datetime.fromisoformat(raw)
        except ValueError as e:
            raise SystemExit(f"Neispravan --since: {args.since!r} ({e})") from e
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    if args.lookback_hours is not None:
        if args.lookback_hours <= 0:
            raise SystemExit("--lookback-hours mora biti > 0")
        return datetime.now(timezone.utc) - timedelta(hours=args.lookback_hours)
    raise SystemExit("Obavezno: --since ILI --lookback-hours.")


def supabase_client():
    url = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
    key = (
        os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        or os.getenv("SUPABASE_KEY")
        or os.getenv("VITE_SUPABASE_ANON_KEY")
    )
    if not url or not key:
        print("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY", file=sys.stderr)
        raise SystemExit(1)
    return create_client(url.strip().strip('"'), key.strip().strip('"'))


def vapid_config() -> tuple[str, dict]:
    private = (os.getenv("VAPID_PRIVATE_KEY") or "").strip().strip('"')
    subject = (os.getenv("VAPID_SUBJECT") or "mailto:hello@cjenko.app").strip().strip(
        '"'
    )
    if not private:
        print("Missing VAPID_PRIVATE_KEY", file=sys.stderr)
        raise SystemExit(1)
    if not subject.startswith("mailto:"):
        subject = f"mailto:{subject}"
    return private, {"sub": subject}


def fmt_price(value) -> str:
    try:
        return f"{float(value):.2f}"
    except (TypeError, ValueError):
        return str(value)


def build_payload(drop: dict) -> dict:
    chain = str(drop.get("chain") or "?").strip() or "?"
    old_s = fmt_price(drop.get("old_price"))
    new_s = fmt_price(drop.get("new_price"))
    barcode = str(drop.get("barcode") or "").strip()
    return {
        "title": "Cjenko",
        "body": f"Cijena pala u {chain}: {old_s} → {new_s} €",
        "url": DEFAULT_URL,
        "tag": f"price-drop-{barcode}-{chain}".lower().replace(" ", "-"),
    }


def fetch_price_drops(client, since: datetime, batch_size: int) -> list[dict]:
    """Svi price_history retci od since; padovi filtrirani u Pythonu."""
    since_iso = since.astimezone(timezone.utc).isoformat()
    drops: list[dict] = []
    offset = 0
    while True:
        resp = (
            client.table("price_history")
            .select("id,barcode,chain,old_price,new_price,detected_at")
            .gte("detected_at", since_iso)
            .order("detected_at")
            .range(offset, offset + batch_size - 1)
            .execute()
        )
        rows = resp.data or []
        if not rows:
            break
        for row in rows:
            try:
                old_p = float(row["old_price"])
                new_p = float(row["new_price"])
            except (TypeError, ValueError, KeyError):
                continue
            if new_p < old_p:
                drops.append(row)
        if len(rows) < batch_size:
            break
        offset += batch_size
    return drops


def fetch_subscriptions_for_barcodes(
    client, barcodes: list[str], batch_size: int
) -> list[dict]:
    """Pretplate čiji tracked_barcodes overlapaju s danim barkodima."""
    if not barcodes:
        return []
    by_id: dict[str, dict] = {}
    unique = sorted({str(b).strip() for b in barcodes if str(b).strip()})
    for i in range(0, len(unique), SUB_BARCODE_CHUNK):
        chunk = unique[i : i + SUB_BARCODE_CHUNK]
        offset = 0
        while True:
            resp = (
                client.table("push_subscriptions")
                .select("id,endpoint,p256dh,auth,tracked_barcodes")
                .overlaps("tracked_barcodes", chunk)
                .order("id")
                .range(offset, offset + batch_size - 1)
                .execute()
            )
            rows = resp.data or []
            if not rows:
                break
            for row in rows:
                rid = str(row.get("id") or "")
                if rid:
                    by_id[rid] = row
            if len(rows) < batch_size:
                break
            offset += batch_size
    return list(by_id.values())


def build_jobs(drops: list[dict], subscriptions: list[dict]) -> list[dict]:
    """Jedan job = jedna notifikacija (pretplata × price_history pad)."""
    jobs: list[dict] = []
    for sub in subscriptions:
        tracked = {
            str(b).strip()
            for b in (sub.get("tracked_barcodes") or [])
            if str(b).strip()
        }
        if not tracked:
            continue
        for drop in drops:
            barcode = str(drop.get("barcode") or "").strip()
            if barcode not in tracked:
                continue
            hid = str(drop.get("id") or "")
            sid = str(sub.get("id") or "")
            jobs.append(
                {
                    "key": f"{sid}:{hid}",
                    "subscription": sub,
                    "drop": drop,
                    "payload": build_payload(drop),
                }
            )
    # Stabilan redoslijed: stariji padovi prvi
    jobs.sort(key=lambda j: (j["drop"].get("detected_at") or "", j["key"]))
    return jobs


def load_checkpoint(path: Path | None) -> set[str]:
    if path is None or not path.exists():
        return set()
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        done = data.get("completed") or []
        return {str(x) for x in done}
    except (OSError, json.JSONDecodeError) as e:
        print(f"WARN: checkpoint read failed ({e}); starting fresh", file=sys.stderr)
        return set()


def save_checkpoint(path: Path | None, completed: set[str]) -> None:
    if path is None:
        return
    path.write_text(
        json.dumps({"completed": sorted(completed)}, indent=2) + "\n",
        encoding="utf-8",
    )


def shorten_endpoint(endpoint: str, n: int = 48) -> str:
    e = endpoint or ""
    if len(e) <= n:
        return e
    return e[: n - 3] + "..."


def is_gone_subscription(exc: BaseException) -> bool:
    response = getattr(exc, "response", None)
    if response is None:
        return False
    status = getattr(response, "status_code", None)
    return status in (404, 410)


def delete_subscription(client, endpoint: str) -> None:
    client.table("push_subscriptions").delete().eq("endpoint", endpoint).execute()


def send_one(subscription: dict, payload: dict, vapid_private: str, claims: dict) -> None:
    from pywebpush import webpush

    webpush(
        subscription_info={
            "endpoint": subscription["endpoint"],
            "keys": {
                "p256dh": subscription["p256dh"],
                "auth": subscription["auth"],
            },
        },
        data=json.dumps(payload, ensure_ascii=False),
        vapid_private_key=vapid_private,
        vapid_claims=dict(claims),
        ttl=86400,
    )


def main() -> int:
    args = parse_args()
    since = resolve_since(args)
    batch_size = max(1, args.batch_size)

    print(f"Window: detected_at >= {since.isoformat()}")
    print(f"dry_run={args.dry_run} limit={args.limit}")

    client = supabase_client()
    drops = fetch_price_drops(client, since, batch_size)
    print(f"price drops in window: {len(drops)}")

    if not drops:
        print("Nothing to send.")
        return 0

    barcodes = [str(d.get("barcode") or "") for d in drops]
    subscriptions = fetch_subscriptions_for_barcodes(client, barcodes, batch_size)
    print(f"matching subscriptions: {len(subscriptions)}")

    jobs = build_jobs(drops, subscriptions)
    print(f"candidate notifications: {len(jobs)}")

    completed = load_checkpoint(args.checkpoint)
    if completed:
        before = len(jobs)
        jobs = [j for j in jobs if j["key"] not in completed]
        print(f"checkpoint: skipped {before - len(jobs)}, remaining {len(jobs)}")

    if args.limit is not None:
        if args.limit < 0:
            raise SystemExit("--limit mora biti >= 0")
        jobs = jobs[: args.limit]
        print(f"after --limit: {len(jobs)}")

    if not jobs:
        print("Nothing to send after filters.")
        return 0

    vapid_private = ""
    claims: dict = {}
    if not args.dry_run:
        vapid_private, claims = vapid_config()

    sent = 0
    failed = 0
    gone = 0

    for job in jobs:
        sub = job["subscription"]
        payload = job["payload"]
        drop = job["drop"]
        endpoint = str(sub.get("endpoint") or "")
        line = (
            f"barcode={drop.get('barcode')} chain={drop.get('chain')} "
            f"endpoint={shorten_endpoint(endpoint)} "
            f"title={payload['title']!r} body={payload['body']!r} "
            f"url={payload['url']!r}"
        )

        if args.dry_run:
            print(f"[dry-run] would send: {line}")
            sent += 1
            continue

        try:
            send_one(sub, payload, vapid_private, claims)
            print(f"[sent] {line}")
            completed.add(job["key"])
            sent += 1
            save_checkpoint(args.checkpoint, completed)
        except Exception as e:
            # pywebpush.WebPushException i ostalo — ne ruši batch
            if is_gone_subscription(e):
                gone += 1
                print(
                    f"[gone] status gone/expired — deleting subscription; {line} err={e!r}",
                    file=sys.stderr,
                )
                try:
                    delete_subscription(client, endpoint)
                except Exception as del_e:
                    print(f"WARN: delete failed: {del_e!r}", file=sys.stderr)
                completed.add(job["key"])
                save_checkpoint(args.checkpoint, completed)
            else:
                failed += 1
                print(f"[fail] {line} err={e!r}", file=sys.stderr)

    print(
        f"Done. sent_or_dry={sent} failed={failed} gone_deleted={gone} "
        f"(candidates_this_run={len(jobs)})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
