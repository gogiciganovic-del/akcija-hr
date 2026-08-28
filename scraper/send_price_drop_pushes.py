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
DEFAULT_URL = "#fav"
NAME_MAX_LEN = 45


def configure_stdio() -> None:
    """UTF-8 stdout/stderr — radi na Windowsu i u GitHub Actions bez PYTHONIOENCODING."""
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            try:
                reconfigure(encoding="utf-8", errors="replace")
            except (OSError, ValueError):
                pass


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
    p.add_argument(
        "--min-drop-pct",
        type=float,
        default=5.0,
        help="Minimalni relativni pad u %% (default 5.0).",
    )
    p.add_argument(
        "--min-drop-eur",
        type=float,
        default=1.0,
        help="Minimalni apsolutni pad u EUR (default 1.0).",
    )
    p.add_argument(
        "--min-drop-mode",
        choices=("any", "all"),
        default="any",
        help='any = pct ILI eur; all = oba moraju proći (default "any").',
    )
    p.add_argument(
        "--cooldown-days",
        type=float,
        default=7.0,
        help="Cooldown u danima za isti barcode+chain (default 7).",
    )
    p.add_argument(
        "--cooldown-eur-epsilon",
        type=float,
        default=0.01,
        help="Tolerancija € za usporedbu s zadnjom poslanom cijenom (default 0.01).",
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


def truncate_name(name: str, max_len: int = NAME_MAX_LEN) -> str:
    text = " ".join(str(name or "").split())
    if len(text) <= max_len:
        return text
    return text[: max_len - 1].rstrip() + "…"


def build_payload(drop: dict, product_name: str | None = None) -> dict:
    chain = str(drop.get("chain") or "?").strip() or "?"
    old_s = fmt_price(drop.get("old_price"))
    new_s = fmt_price(drop.get("new_price"))
    barcode = str(drop.get("barcode") or "").strip()
    if product_name:
        body = f"Cijena pala: {product_name} ({chain}) {old_s} -> {new_s} €"
    else:
        body = f"Cijena pala u {chain}: {old_s} -> {new_s} €"
    return {
        "title": "Cjenko",
        "body": body,
        "url": f"#fav?highlight={barcode}" if barcode else DEFAULT_URL,
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


def drop_metrics(drop: dict) -> tuple[float, float] | None:
    """Vrati (drop_pct, drop_eur) ili None ako cijene nisu valjane."""
    try:
        old_p = float(drop["old_price"])
        new_p = float(drop["new_price"])
    except (TypeError, ValueError, KeyError):
        return None
    if old_p <= 0 or new_p >= old_p:
        return None
    drop_eur = old_p - new_p
    drop_pct = (drop_eur / old_p) * 100.0
    return drop_pct, drop_eur


def passes_min_threshold(
    drop: dict,
    min_drop_pct: float,
    min_drop_eur: float,
    min_drop_mode: str,
) -> bool:
    metrics = drop_metrics(drop)
    if metrics is None:
        return False
    drop_pct, drop_eur = metrics
    pct_ok = drop_pct >= min_drop_pct
    eur_ok = drop_eur >= min_drop_eur
    if min_drop_mode == "all":
        return pct_ok and eur_ok
    return pct_ok or eur_ok


def filter_drops_by_threshold(
    drops: list[dict],
    min_drop_pct: float,
    min_drop_eur: float,
    min_drop_mode: str,
) -> tuple[list[dict], int]:
    kept: list[dict] = []
    skipped = 0
    for drop in drops:
        if passes_min_threshold(drop, min_drop_pct, min_drop_eur, min_drop_mode):
            kept.append(drop)
        else:
            skipped += 1
    return kept, skipped


class NameLookup:
    """Batch-učitani nazivi proizvoda po barkodu/lancu."""

    __slots__ = ("by_barcode_chain", "by_barcode_any", "by_barcode_products")

    def __init__(
        self,
        by_barcode_chain: dict[tuple[str, str], str],
        by_barcode_any: dict[str, str],
        by_barcode_products: dict[str, str],
    ) -> None:
        self.by_barcode_chain = by_barcode_chain
        self.by_barcode_any = by_barcode_any
        self.by_barcode_products = by_barcode_products


def fetch_product_names(
    client, drops: list[dict], batch_size: int
) -> tuple[NameLookup, dict[str, int]]:
    """Batch lookup naziva za unique (barcode, chain) iz filtriranih padova."""
    unique_barcodes = sorted(
        {
            str(d.get("barcode") or "").strip()
            for d in drops
            if str(d.get("barcode") or "").strip()
        }
    )
    unique_pairs = {
        (
            str(d.get("barcode") or "").strip(),
            str(d.get("chain") or "").strip(),
        )
        for d in drops
        if str(d.get("barcode") or "").strip()
    }

    by_barcode_chain: dict[tuple[str, str], str] = {}
    by_barcode_any: dict[str, str] = {}
    rp_queries = 0

    for i in range(0, len(unique_barcodes), SUB_BARCODE_CHUNK):
        chunk = unique_barcodes[i : i + SUB_BARCODE_CHUNK]
        if not chunk:
            continue
        rp_queries += 1
        offset = 0
        while True:
            resp = (
                client.table("regular_prices")
                .select("barcode,chain,name")
                .in_("barcode", chunk)
                .order("barcode")
                .range(offset, offset + batch_size - 1)
                .execute()
            )
            rows = resp.data or []
            if not rows:
                break
            for row in rows:
                barcode = str(row.get("barcode") or "").strip()
                chain = str(row.get("chain") or "").strip()
                name = str(row.get("name") or "").strip()
                if not barcode or not name:
                    continue
                if chain:
                    by_barcode_chain[(barcode, chain)] = name
                if barcode not in by_barcode_any:
                    by_barcode_any[barcode] = name
            if len(rows) < batch_size:
                break
            offset += batch_size

    need_products = [b for b in unique_barcodes if b not in by_barcode_any]
    by_barcode_products: dict[str, str] = {}
    prod_queries = 0

    for i in range(0, len(need_products), SUB_BARCODE_CHUNK):
        chunk = need_products[i : i + SUB_BARCODE_CHUNK]
        if not chunk:
            continue
        prod_queries += 1
        offset = 0
        while True:
            resp = (
                client.table("products")
                .select("barcode,name")
                .in_("barcode", chunk)
                .order("barcode")
                .range(offset, offset + batch_size - 1)
                .execute()
            )
            rows = resp.data or []
            if not rows:
                break
            for row in rows:
                barcode = str(row.get("barcode") or "").strip()
                name = str(row.get("name") or "").strip()
                if barcode and name and barcode not in by_barcode_products:
                    by_barcode_products[barcode] = name
            if len(rows) < batch_size:
                break
            offset += batch_size

    stats = {
        "unique_barcodes": len(unique_barcodes),
        "unique_pairs": len(unique_pairs),
        "regular_prices_queries": rp_queries,
        "products_queries": prod_queries,
        "resolved_chain_match": sum(
            1
            for pair in unique_pairs
            if pair in by_barcode_chain or pair[0] in by_barcode_any or pair[0] in by_barcode_products
        ),
    }
    return NameLookup(by_barcode_chain, by_barcode_any, by_barcode_products), stats


def resolve_product_name(
    lookup: NameLookup, barcode: str, chain: str
) -> str | None:
    b = str(barcode or "").strip()
    c = str(chain or "").strip()
    if not b:
        return None
    raw = lookup.by_barcode_chain.get((b, c))
    if raw:
        return truncate_name(raw)
    raw = lookup.by_barcode_any.get(b)
    if raw:
        return truncate_name(raw)
    raw = lookup.by_barcode_products.get(b)
    if raw:
        return truncate_name(raw)
    return None


def print_dry_run_payload_samples(
    drops: list[dict], lookup: NameLookup, max_with_name: int = 3, max_without: int = 1
) -> None:
    shown_with = 0
    shown_without = 0
    for drop in drops:
        barcode = str(drop.get("barcode") or "").strip()
        chain = str(drop.get("chain") or "").strip()
        name = resolve_product_name(lookup, barcode, chain)
        payload = build_payload(drop, name)
        if name and shown_with < max_with_name:
            print(
                f"[dry-run sample] barcode={barcode} chain={chain} "
                f"body={payload['body']!r}"
            )
            shown_with += 1
        elif not name and shown_without < max_without:
            print(
                f"[dry-run sample fallback] barcode={barcode} chain={chain} "
                f"body={payload['body']!r}"
            )
            shown_without += 1
        if shown_with >= max_with_name and shown_without >= max_without:
            break
    if shown_without == 0:
        print("[dry-run sample fallback] (nema pada bez naziva u ovom prozoru)")


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


def build_jobs(
    drops: list[dict], subscriptions: list[dict], lookup: NameLookup
) -> list[dict]:
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
            chain = str(drop.get("chain") or "").strip()
            name = resolve_product_name(lookup, barcode, chain)
            jobs.append(
                {
                    "key": f"{sid}:{hid}",
                    "subscription": sub,
                    "drop": drop,
                    "payload": build_payload(drop, name),
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


def drop_new_price(drop: dict) -> float | None:
    try:
        return float(drop["new_price"])
    except (TypeError, ValueError, KeyError):
        return None


def parse_sent_at(value) -> datetime | None:
    if not value:
        return None
    raw = str(value).strip().replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(raw)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def hard_dedup_exists(client, subscription_id: str, price_history_id: str) -> bool:
    resp = (
        client.table("push_drop_notifications")
        .select("id")
        .eq("subscription_id", subscription_id)
        .eq("price_history_id", price_history_id)
        .limit(1)
        .execute()
    )
    return bool(resp.data)


def fetch_last_sent_for_pair(
    client, subscription_id: str, barcode: str, chain: str
) -> dict | None:
    resp = (
        client.table("push_drop_notifications")
        .select("new_price,sent_at")
        .eq("subscription_id", subscription_id)
        .eq("barcode", barcode)
        .eq("chain", chain)
        .order("sent_at", desc=True)
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    return rows[0] if rows else None


def evaluate_send_decision(
    client,
    subscription_id: str,
    drop: dict,
    cooldown_days: float,
    cooldown_eur_epsilon: float,
    now: datetime | None = None,
) -> tuple[bool, str]:
    """
    Vrati (allow, reason) prije slanja.
    reason: 'ok: ...' ili 'skip: ...'
    """
    now = now or datetime.now(timezone.utc)
    price_history_id = str(drop.get("id") or "").strip()
    barcode = str(drop.get("barcode") or "").strip()
    chain = str(drop.get("chain") or "").strip()
    new_price = drop_new_price(drop)

    if not price_history_id:
        return False, "skip: missing price_history_id"
    if not barcode or not chain:
        return False, "skip: missing barcode or chain"
    if new_price is None:
        return False, "skip: invalid new_price"

    if hard_dedup_exists(client, subscription_id, price_history_id):
        return False, "skip: hard dedup (already sent for this price_history row)"

    last = fetch_last_sent_for_pair(client, subscription_id, barcode, chain)
    if not last:
        return True, "ok: first notification for subscription+barcode+chain"

    try:
        last_new = float(last["new_price"])
    except (TypeError, ValueError, KeyError):
        return True, "ok: last sent row has invalid new_price"

    last_sent_at = parse_sent_at(last.get("sent_at"))
    if last_sent_at is None:
        return True, "ok: last sent row has invalid sent_at"

    cooldown = timedelta(days=cooldown_days)
    within_cooldown = (now - last_sent_at) < cooldown

    if not within_cooldown:
        return True, "ok: cooldown expired"

    if new_price < last_new - cooldown_eur_epsilon:
        return True, f"ok: lower than last sent ({new_price:.2f} < {last_new:.2f})"

    return False, (
        f"skip: cooldown ({cooldown_days}d) — same or higher price "
        f"(new={new_price:.2f}, last_sent={last_new:.2f})"
    )


def record_push_drop_sent(client, subscription_id: str, drop: dict) -> None:
    price_history_id = str(drop.get("id") or "").strip()
    if not price_history_id:
        raise ValueError("record_push_drop_sent: missing price_history_id")
    client.table("push_drop_notifications").insert(
        {
            "subscription_id": subscription_id,
            "price_history_id": price_history_id,
            "barcode": str(drop.get("barcode") or "").strip(),
            "chain": str(drop.get("chain") or "").strip(),
            "old_price": drop.get("old_price"),
            "new_price": drop.get("new_price"),
        }
    ).execute()


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
    configure_stdio()
    args = parse_args()
    since = resolve_since(args)
    batch_size = max(1, args.batch_size)

    print(f"Window: detected_at >= {since.isoformat()}")
    print(
        f"dry_run={args.dry_run} limit={args.limit} "
        f"min_drop_pct={args.min_drop_pct} min_drop_eur={args.min_drop_eur} "
        f"min_drop_mode={args.min_drop_mode} "
        f"cooldown_days={args.cooldown_days} cooldown_eur_epsilon={args.cooldown_eur_epsilon}"
    )

    client = supabase_client()
    drops = fetch_price_drops(client, since, batch_size)
    print(f"price drops in window: {len(drops)}")

    if not drops:
        print("Nothing to send.")
        return 0

    drops, skipped_threshold = filter_drops_by_threshold(
        drops,
        args.min_drop_pct,
        args.min_drop_eur,
        args.min_drop_mode,
    )
    print(f"after min threshold: {len(drops)} drops (skipped {skipped_threshold})")

    if not drops:
        print("Nothing to send after min threshold.")
        return 0

    name_lookup, name_stats = fetch_product_names(client, drops, batch_size)
    print(
        "name lookup: "
        f"{name_stats['unique_barcodes']} barcodes, "
        f"{name_stats['unique_pairs']} (barcode, chain) pairs, "
        f"{name_stats['regular_prices_queries']} regular_prices batch queries, "
        f"{name_stats['products_queries']} products batch queries"
    )

    if args.dry_run:
        print_dry_run_payload_samples(drops, name_lookup)

    barcodes = [str(d.get("barcode") or "") for d in drops]
    subscriptions = fetch_subscriptions_for_barcodes(client, barcodes, batch_size)
    print(f"matching subscriptions: {len(subscriptions)}")

    jobs = build_jobs(drops, subscriptions, name_lookup)
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
    skipped_dedup = 0

    for job in jobs:
        sub = job["subscription"]
        payload = job["payload"]
        drop = job["drop"]
        endpoint = str(sub.get("endpoint") or "")
        subscription_id = str(sub.get("id") or "")
        line = (
            f"barcode={drop.get('barcode')} chain={drop.get('chain')} "
            f"endpoint={shorten_endpoint(endpoint)} "
            f"title={payload['title']!r} body={payload['body']!r} "
            f"url={payload['url']!r}"
        )

        allow, dedup_reason = evaluate_send_decision(
            client,
            subscription_id,
            drop,
            args.cooldown_days,
            args.cooldown_eur_epsilon,
        )
        if not allow:
            skipped_dedup += 1
            prefix = "[dry-run] skip" if args.dry_run else "[skip]"
            print(f"{prefix} ({dedup_reason}): {line}")
            continue

        if args.dry_run:
            print(f"[dry-run] would send (dedup: {dedup_reason}): {line}")
            sent += 1
            continue

        try:
            send_one(sub, payload, vapid_private, claims)
            record_push_drop_sent(client, subscription_id, drop)
            print(f"[sent] (dedup: {dedup_reason}) {line}")
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
        f"Done. sent_or_dry={sent} skipped_dedup={skipped_dedup} failed={failed} "
        f"gone_deleted={gone} (candidates_this_run={len(jobs)})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
