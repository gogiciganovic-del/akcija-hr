#!/usr/bin/env python3
"""
Jednokratna provjera try_reserve_flyer na produkcijskoj bazi.
NE ide u workflow. Ne šalje Web Push.

Pokreni: py -3 scripts/live-check-flyer-reserve.py
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scraper"))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env")
load_dotenv(ROOT / "scraper" / ".env")

from send_flyer_pushes import (  # noqa: E402
    configure_stdio,
    release_flyer_reservation,
    supabase_client,
    try_reserve_flyer,
)

ENDPOINT = "https://smoke-test.invalid/push/flyer-reserve-check"
CHAIN = "Kaufland"
WEEK = "2099-W01"


def main() -> int:
    configure_stdio()
    client = supabase_client()
    sub_id: str | None = None

    try:
        print(f"upsert_push_subscription endpoint={ENDPOINT!r}")
        client.rpc(
            "upsert_push_subscription",
            {
                "p_endpoint": ENDPOINT,
                "p_p256dh": "smoke-flyer-reserve-p256dh",
                "p_auth": "smoke-flyer-reserve-auth",
                "p_tracked_barcodes": [],
            },
        ).execute()

        resp = (
            client.table("push_subscriptions")
            .select("id,followed_chains")
            .eq("endpoint", ENDPOINT)
            .limit(1)
            .execute()
        )
        rows = resp.data or []
        if not rows:
            print("FAIL: subscription row not found after upsert", file=sys.stderr)
            return 1
        sub_id = str(rows[0]["id"])
        followed = rows[0].get("followed_chains") or []
        print(f"subscription_id={sub_id} followed_chains={followed!r}")

        r1 = try_reserve_flyer(client, sub_id, CHAIN, WEEK)
        print(f"try_reserve #1 → {r1} (expect True)")
        r2 = try_reserve_flyer(client, sub_id, CHAIN, WEEK)
        print(f"try_reserve #2 → {r2} (expect False)")

        release_flyer_reservation(client, sub_id, CHAIN, WEEK)
        print("release_flyer_reservation done")

        r3 = try_reserve_flyer(client, sub_id, CHAIN, WEEK)
        print(f"try_reserve #3 after release → {r3} (expect True)")

        ok = r1 is True and r2 is False and r3 is True
        print(f"reserve checks ok={ok}")
        return 0 if ok else 2
    finally:
        print("--- finally: cleanup ---")
        try:
            client.rpc(
                "delete_push_subscription",
                {"p_endpoint": ENDPOINT},
            ).execute()
            print("delete_push_subscription done")
        except Exception as e:
            print(f"WARN: delete_push_subscription failed: {type(e).__name__}", file=sys.stderr)

        left_sub = (
            client.table("push_subscriptions")
            .select("id")
            .eq("endpoint", ENDPOINT)
            .execute()
        )
        n_sub = len(left_sub.data or [])
        print(f"remaining push_subscriptions for endpoint: {n_sub} (expect 0)")

        if sub_id:
            left_log = (
                client.table("push_flyer_notifications")
                .select("id")
                .eq("subscription_id", sub_id)
                .execute()
            )
            n_log = len(left_log.data or [])
            print(f"remaining push_flyer_notifications for id: {n_log} (expect 0)")
        else:
            print("remaining push_flyer_notifications for id: n/a (no id)")


if __name__ == "__main__":
    raise SystemExit(main())
