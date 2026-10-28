#!/usr/bin/env python3
"""
Pošalji Web Push za „Izašao je novi letak” (Eurospin, Kaufland, Plodine).

Detekcija: flyer_detect_lib.should_fire (isti prag kao Faza 0 / detect_new_flyers).
Pretplate: push_subscriptions.followed_chains @> [lanac].
Dedup: push_flyer_notifications UNIQUE(subscription_id, chain, flyer_week).

DEFAULT = dry-run (ništa se ne šalje ni ne upisuje). Stvarno slanje samo uz --send.
Obavezan --limit. Ne logira endpoint / p256dh / auth (samo sha256 prefiks).

Slanje: rezervacija reda PRIJE webpush; 404/410 → delete_subscription (CASCADE);
privremena greška → obriši rezervaciju (retry).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Callable
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv

load_dotenv(ROOT.parent / ".env")
load_dotenv(ROOT / ".env")

from detect_new_flyers import (  # noqa: E402
    evaluate_day,
    fetch_scrape_sets,
    fetch_stores,
)
from flyer_detect_lib import iso_week_key  # noqa: E402
from send_price_drop_pushes import (  # noqa: E402
    configure_stdio,
    delete_subscription,
    is_gone_subscription,
    send_one,
    supabase_client,
    vapid_config,
)

ALLOWED_CHAINS = ("Eurospin", "Kaufland", "Plodine")
ALLOWED_CHAINS_SET = frozenset(ALLOWED_CHAINS)
FETCH_BATCH = 500


def endpoint_hash_prefix(endpoint: str, n: int = 12) -> str:
    return hashlib.sha256((endpoint or "").encode("utf-8")).hexdigest()[:n]


def build_flyer_payload(chain: str, flyer_week: str) -> dict:
    c = str(chain or "").strip()
    week = str(flyer_week or "").strip()
    return {
        "title": "Izašao je novi letak",
        "body": f"{c}: pogledaj nove akcije",
        "url": f"/?trgovina={quote(c, safe='')}",
        "tag": f"flyer-{c.lower()}-{week}",
    }


def flyer_job_key(subscription_id: str, chain: str, flyer_week: str) -> tuple[str, str, str]:
    return (str(subscription_id), str(chain), str(flyer_week))


def try_reserve_flyer(
    client, subscription_id: str, chain: str, flyer_week: str
) -> bool:
    """
    Atomski INSERT (ignore duplicates). True ako je red STVARNO novoupisan.
    """
    resp = (
        client.table("push_flyer_notifications")
        .upsert(
            {
                "subscription_id": subscription_id,
                "chain": chain,
                "flyer_week": flyer_week,
            },
            on_conflict="subscription_id,chain,flyer_week",
            ignore_duplicates=True,
        )
        .execute()
    )
    return bool(resp.data)


def release_flyer_reservation(
    client, subscription_id: str, chain: str, flyer_week: str
) -> None:
    (
        client.table("push_flyer_notifications")
        .delete()
        .eq("subscription_id", subscription_id)
        .eq("chain", chain)
        .eq("flyer_week", flyer_week)
        .execute()
    )


def fetch_sent_keys_for_chain_weeks(
    client,
    chain_weeks: list[tuple[str, str]],
    batch_size: int = FETCH_BATCH,
) -> set[tuple[str, str, str]]:
    """Svi (subscription_id, chain, flyer_week) već u logu za dane parove."""
    out: set[tuple[str, str, str]] = set()
    pairs = sorted({(str(c), str(w)) for c, w in chain_weeks if c and w})
    for chain, week in pairs:
        offset = 0
        while True:
            resp = (
                client.table("push_flyer_notifications")
                .select("subscription_id,chain,flyer_week")
                .eq("chain", chain)
                .eq("flyer_week", week)
                .order("subscription_id")
                .range(offset, offset + batch_size - 1)
                .execute()
            )
            rows = resp.data or []
            if not rows:
                break
            for row in rows:
                sid = str(row.get("subscription_id") or "")
                ch = str(row.get("chain") or "")
                wk = str(row.get("flyer_week") or "")
                if sid and ch and wk:
                    out.add(flyer_job_key(sid, ch, wk))
            if len(rows) < batch_size:
                break
            offset += batch_size
    return out


def filter_unsent_jobs(
    jobs: list[dict], sent_keys: set[tuple[str, str, str]]
) -> tuple[list[dict], int]:
    """Izbaci jobove koji već imaju log red (prije --limit)."""
    kept: list[dict] = []
    skipped = 0
    for job in jobs:
        sid = str(job["subscription"].get("id") or "")
        key = flyer_job_key(sid, job["chain"], job["flyer_week"])
        if key in sent_keys:
            skipped += 1
            continue
        kept.append(job)
    return kept, skipped


def fetch_subscriptions_for_chain(
    client, chain: str, batch_size: int = FETCH_BATCH
) -> list[dict]:
    """Pretplate čiji followed_chains sadrži lanac (contains / @>)."""
    by_id: dict[str, dict] = {}
    offset = 0
    while True:
        resp = (
            client.table("push_subscriptions")
            .select("id,endpoint,p256dh,auth,followed_chains")
            .contains("followed_chains", [chain])
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


def firing_chains(
    detection_rows: list[dict],
) -> list[dict]:
    """Samo ALLOWED_CHAINS s would_fire=True."""
    out: list[dict] = []
    for row in detection_rows:
        chain = str(row.get("chain") or "").strip()
        if chain not in ALLOWED_CHAINS_SET:
            continue
        if not row.get("would_fire"):
            continue
        out.append(row)
    return out


def build_jobs(
    fire_rows: list[dict],
    subscriptions_by_chain: dict[str, list[dict]],
) -> list[dict]:
    """Jedan job = jedna notifikacija (pretplata × lanac × tjedan)."""
    jobs: list[dict] = []
    for row in fire_rows:
        chain = str(row.get("chain") or "").strip()
        week = str(row.get("week") or "").strip()
        if not chain or not week:
            continue
        for sub in subscriptions_by_chain.get(chain) or []:
            followed = {
                str(c).strip()
                for c in (sub.get("followed_chains") or [])
                if str(c).strip()
            }
            if chain not in followed:
                continue
            sid = str(sub.get("id") or "")
            jobs.append(
                {
                    "key": f"{sid}:{chain}:{week}",
                    "subscription": sub,
                    "chain": chain,
                    "flyer_week": week,
                    "payload": build_flyer_payload(chain, week),
                }
            )
    jobs.sort(key=lambda j: (j["chain"], j["flyer_week"], j["key"]))
    return jobs


def filter_jobs_by_endpoint_hash(
    jobs: list[dict], only_hash: str | None
) -> list[dict]:
    if not only_hash:
        return jobs
    want = only_hash.strip().lower()
    if not want:
        return jobs
    return [
        j
        for j in jobs
        if endpoint_hash_prefix(str(j["subscription"].get("endpoint") or ""))
        == want
    ]


def process_jobs(
    jobs: list[dict],
    *,
    dry_run: bool,
    try_reserve: Callable[[str, str, str], bool],
    release_reserve: Callable[[str, str, str], None],
    send_fn: Callable[[dict, dict], None],
    delete_sub: Callable[[str], None],
    log: Callable[..., None] = print,
) -> dict:
    """
    dry-run: samo log (bez rezervacije / slanja).
    send: rezerviraj → pošalji; 404/410 briše pretplatu; inače pusti rezervaciju.
    """
    sent = 0
    failed = 0
    gone = 0
    skipped_dedup = 0

    for job in jobs:
        sub = job["subscription"]
        payload = job["payload"]
        chain = job["chain"]
        week = job["flyer_week"]
        sid = str(sub.get("id") or "")
        endpoint = str(sub.get("endpoint") or "")
        ehash = endpoint_hash_prefix(endpoint)
        line = (
            f"chain={chain} week={week} endpoint_hash={ehash} "
            f"title={payload['title']!r} body={payload['body']!r} "
            f"url={payload['url']!r} tag={payload['tag']!r}"
        )

        if dry_run:
            log(f"[dry-run] would send: {line}")
            sent += 1
            continue

        reserved = try_reserve(sid, chain, week)
        if not reserved:
            skipped_dedup += 1
            log(f"[skip] (dedup/reserve): {line}")
            continue

        try:
            send_fn(sub, payload)
            log(f"[sent] {line}")
            sent += 1
        except Exception as e:
            if is_gone_subscription(e):
                gone += 1
                log(
                    f"[gone] status gone/expired — deleting subscription; "
                    f"{line} err={type(e).__name__}",
                    file=sys.stderr,
                )
                try:
                    delete_sub(endpoint)
                except Exception as del_e:
                    log(f"WARN: delete failed: {type(del_e).__name__}", file=sys.stderr)
            else:
                failed += 1
                log(f"[fail] {line} err={type(e).__name__}", file=sys.stderr)
                try:
                    release_reserve(sid, chain, week)
                except Exception as rel_e:
                    log(
                        f"WARN: release reservation failed "
                        f"endpoint_hash={ehash} err={type(rel_e).__name__}",
                        file=sys.stderr,
                    )

    return {
        "sent": sent,
        "failed": failed,
        "gone": gone,
        "skipped_dedup": skipped_dedup,
        "candidates": len(jobs),
        "dry_run": dry_run,
    }


def emit_flyer_push_stats(payload: dict) -> None:
    print(
        f"FLYER_PUSH_STATS={json.dumps(payload, ensure_ascii=False, separators=(',', ':'))}"
    )
    sys.stdout.flush()


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Send Web Push for new flyer (Eurospin/Kaufland/Plodine)."
    )
    p.add_argument(
        "--limit",
        type=int,
        required=True,
        help="Obavezno: max broj notifikacija u ovom runu.",
    )
    p.add_argument(
        "--send",
        action="store_true",
        help="Stvarno pošalji push i upiši log. Bez ovoga: dry-run.",
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Eksplicitni dry-run (default ako nema --send).",
    )
    p.add_argument(
        "--only-endpoint-hash",
        help="Samo pretplata čiji sha256(endpoint)[:12] odgovara (hex).",
    )
    p.add_argument(
        "--as-of",
        help="UTC datum YYYY-MM-DD za detekciju (default: danas UTC).",
    )
    p.add_argument(
        "--batch-size",
        type=int,
        default=FETCH_BATCH,
        help=f"Stranica fetcha (default {FETCH_BATCH}).",
    )
    return p.parse_args(argv)


def resolve_dry_run(args: argparse.Namespace) -> bool:
    if args.send and args.dry_run:
        raise SystemExit("Koristi samo jedno: --send ILI --dry-run (default dry-run).")
    if args.send:
        return False
    return True


def apply_limit_after_dedup(
    jobs: list[dict],
    sent_keys: set[tuple[str, str, str]],
    limit: int,
) -> tuple[list[dict], int, int]:
    """
    Vrati (limited_jobs, skipped_already, total_unsent).
    Dedup prije limita.
    """
    unsent, skipped = filter_unsent_jobs(jobs, sent_keys)
    return unsent[:limit], skipped, len(unsent)


def _main_impl(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if args.limit < 0:
        raise SystemExit("--limit mora biti >= 0")
    dry_run = resolve_dry_run(args)
    batch_size = max(1, args.batch_size)

    if args.as_of:
        try:
            as_of = date.fromisoformat(args.as_of.strip())
        except ValueError as e:
            raise SystemExit(f"Neispravan --as-of: {args.as_of!r} ({e})") from e
    else:
        as_of = datetime.now(timezone.utc).date()

    week = iso_week_key(as_of)
    print(
        f"send_flyer_pushes dry_run={dry_run} limit={args.limit} "
        f"as_of={as_of.isoformat()} week={week} "
        f"chains={','.join(ALLOWED_CHAINS)} "
        f"only_hash={args.only_endpoint_hash or '-'}"
    )

    client = supabase_client()
    store_by_id = fetch_stores(client)
    by_chain = fetch_scrape_sets(client, store_by_id, batch_size)
    detection_rows = evaluate_day(by_chain, as_of)
    fires = firing_chains(detection_rows)

    for r in detection_rows:
        chain = r["chain"]
        if chain not in ALLOWED_CHAINS_SET:
            continue
        print(
            f"  detect {chain}: would_fire={r['would_fire']} "
            f"new={r['new_n']} today={r['today_n']} ({r['reason']})"
        )

    if not fires:
        print("Nema čistih lanaca s should_fire=true — ništa za slanje.")
        emit_flyer_push_stats(
            {
                "ok": True,
                "dry_run": dry_run,
                "limit": args.limit,
                "sent": 0,
                "gone": 0,
                "failed": 0,
                "skipped_dedup": 0,
                "candidates": 0,
                "fire_chains": [],
            }
        )
        return 0

    fire_names = [str(r["chain"]) for r in fires]
    print(f"fire_chains: {fire_names}")

    subscriptions_by_chain: dict[str, list[dict]] = {}
    for r in fires:
        chain = str(r["chain"])
        subs = fetch_subscriptions_for_chain(client, chain, batch_size)
        subscriptions_by_chain[chain] = subs
        print(f"  followers {chain}: {len(subs)}")

    jobs = build_jobs(fires, subscriptions_by_chain)
    print(f"candidate notifications: {len(jobs)}")

    jobs = filter_jobs_by_endpoint_hash(jobs, args.only_endpoint_hash)
    if args.only_endpoint_hash:
        print(f"after --only-endpoint-hash: {len(jobs)}")

    chain_weeks = [
        (str(r.get("chain") or ""), str(r.get("week") or "")) for r in fires
    ]
    sent_keys = fetch_sent_keys_for_chain_weeks(client, chain_weeks, batch_size)
    jobs, skipped_pre, unsent_n = apply_limit_after_dedup(
        jobs, sent_keys, args.limit
    )
    print(
        f"after dedup-before-limit: skipped_already={skipped_pre} "
        f"unsent={unsent_n} after_limit={len(jobs)}"
    )

    if not jobs:
        print("Nothing to send after filters.")
        emit_flyer_push_stats(
            {
                "ok": True,
                "dry_run": dry_run,
                "limit": args.limit,
                "sent": 0,
                "gone": 0,
                "failed": 0,
                "skipped_dedup": skipped_pre,
                "candidates": 0,
                "fire_chains": fire_names,
            }
        )
        return 0

    vapid_private = ""
    claims: dict = {}
    if not dry_run:
        vapid_private, claims = vapid_config()

    def try_reserve(sid: str, chain: str, flyer_week: str) -> bool:
        return try_reserve_flyer(client, sid, chain, flyer_week)

    def release_reserve(sid: str, chain: str, flyer_week: str) -> None:
        release_flyer_reservation(client, sid, chain, flyer_week)

    def send_fn(sub: dict, payload: dict) -> None:
        send_one(sub, payload, vapid_private, claims)

    def delete_sub(endpoint: str) -> None:
        delete_subscription(client, endpoint)

    stats = process_jobs(
        jobs,
        dry_run=dry_run,
        try_reserve=try_reserve,
        release_reserve=release_reserve,
        send_fn=send_fn,
        delete_sub=delete_sub,
    )
    print(
        f"Done. sent_or_dry={stats['sent']} skipped_dedup={stats['skipped_dedup']} "
        f"failed={stats['failed']} gone_deleted={stats['gone']} "
        f"(candidates_this_run={stats['candidates']}, pre_limit_skipped={skipped_pre})"
    )
    emit_flyer_push_stats(
        {
            "ok": True,
            "dry_run": dry_run,
            "limit": args.limit,
            "sent": stats["sent"],
            "gone": stats["gone"],
            "failed": stats["failed"],
            "skipped_dedup": skipped_pre + stats["skipped_dedup"],
            "candidates": stats["candidates"],
            "fire_chains": fire_names,
        }
    )
    return 0


def main(argv: list[str] | None = None) -> int:
    configure_stdio()
    try:
        return _main_impl(argv)
    except Exception as e:
        emit_flyer_push_stats(
            {
                "ok": False,
                "error": type(e).__name__,
                "dry_run": True,
                "sent": 0,
                "gone": 0,
                "failed": 0,
                "skipped_dedup": 0,
                "candidates": 0,
            }
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
