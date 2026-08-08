#!/usr/bin/env python3
"""Run 005_enable_rls_all_tables.sql on remote Supabase (Management API or Postgres)."""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MIGRATION = ROOT / "supabase" / "migrations" / "005_enable_rls_all_tables.sql"
PROJECT_REF = os.environ.get("SUPABASE_PROJECT_REF", "abzkyxuhbkfpdjpdpmpq")


def run_via_management_api(sql: str) -> None:
    import httpx

    token = os.environ.get("SUPABASE_ACCESS_TOKEN")
    if not token:
        raise RuntimeError("Set SUPABASE_ACCESS_TOKEN (Personal Access Token from supabase.com/dashboard/account/tokens)")

    url = f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query"
    r = httpx.post(
        url,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={"query": sql},
        timeout=120.0,
    )
    if r.status_code >= 400:
        raise RuntimeError(f"API {r.status_code}: {r.text}")
    print("Migration applied via Supabase Management API.")
    print(r.json() if r.content else "OK")


def run_via_postgres(sql: str) -> None:
    import psycopg2

    db_url = os.environ.get("DATABASE_URL") or os.environ.get("SUPABASE_DB_URL")
    if not db_url:
        password = os.environ.get("SUPABASE_DB_PASSWORD")
        if not password:
            raise RuntimeError("Set DATABASE_URL or SUPABASE_DB_PASSWORD")
        host = os.environ.get("SUPABASE_DB_HOST", f"db.{PROJECT_REF}.supabase.co")
        db_url = (
            f"postgresql://postgres:{password}@{host}:5432/postgres?sslmode=require"
        )

    conn = psycopg2.connect(db_url)
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            cur.execute(sql)
        print("Migration applied via direct Postgres connection.")
    finally:
        conn.close()


def main() -> int:
    sql = MIGRATION.read_text(encoding="utf-8")
    if not MIGRATION.exists():
        print(f"Missing {MIGRATION}", file=sys.stderr)
        return 1

    if os.environ.get("SUPABASE_ACCESS_TOKEN"):
        run_via_management_api(sql)
        return 0
    if os.environ.get("DATABASE_URL") or os.environ.get("SUPABASE_DB_PASSWORD"):
        run_via_postgres(sql)
        return 0

    print(
        "Need credentials. Either:\n"
        "  1. $env:SUPABASE_ACCESS_TOKEN = '<pat>'  (supabase.com/dashboard/account/tokens)\n"
        "  2. $env:SUPABASE_DB_PASSWORD = '<db password>'  (Project Settings → Database)\n"
        "Then: py scripts/run_rls_migration.py",
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
