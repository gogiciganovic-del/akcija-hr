#!/usr/bin/env python3
"""
Parsiraj IMPORT_STATS= / PUSH_STATS= iz CI logova i napiši GitHub Job Summary.

Usage:
  python scraper/ci_write_job_summary.py --import-log /tmp/import.log --push-log /tmp/push.log
  # ili samo stdin/test:
  python scraper/ci_write_job_summary.py --import-line 'IMPORT_STATS={...}' --push-line 'PUSH_STATS={...}'
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path


def extract_stats_line(text: str, prefix: str) -> dict | None:
    last = None
    for line in text.splitlines():
        line = line.strip().lstrip("\ufeff")
        if prefix in line:
            # allow leading junk / BOM; take from prefix
            idx = line.index(prefix)
            raw = line[idx + len(prefix) :]
            try:
                last = json.loads(raw)
            except json.JSONDecodeError:
                continue
    return last


def load_from_file(path: Path | None, prefix: str) -> dict | None:
    if path is None or not path.is_file():
        return None
    return extract_stats_line(path.read_text(encoding="utf-8", errors="replace"), prefix)


def fmt_warnings(warnings: list) -> str:
    if not warnings:
        return "—"
    return ", ".join(f"⚠️ `{w}`" for w in warnings)


def write_import_section(f, stats: dict | None) -> None:
    f.write("## Import\n\n")
    if not stats:
        f.write("_Nema `IMPORT_STATS` reda u logu._\n\n")
        return

    warnings = list(stats.get("warnings") or [])
    f.write("| Field | Value |\n| --- | --- |\n")
    f.write(f"| ok | `{json.dumps(bool(stats.get('ok')))}` |\n")
    f.write(f"| upserted | {stats.get('upserted', 0)} |\n")
    f.write(f"| price_changes | {stats.get('price_changes', 0)} |\n")
    f.write(f"| size_changes | {stats.get('size_changes', 0)} |\n")
    f.write(f"| max_warn | {stats.get('price_changes_max_warn', '—')} |\n")
    chains = stats.get("chains") or []
    f.write(f"| chains | {', '.join(chains) if chains else '—'} |\n")
    f.write(f"| warnings | {fmt_warnings(warnings)} |\n\n")

    by_price = stats.get("price_changes_by_chain") or {}
    if by_price:
        f.write("### Price changes by chain\n\n")
        f.write("| Chain | Changes |\n| --- | ---: |\n")
        for chain in sorted(by_price.keys()):
            f.write(f"| {chain} | {by_price[chain]} |\n")
        f.write("\n")

    if "price_changes_zero" in warnings:
        f.write(
            "> ⚠️ **price_changes == 0** — moguće da crawl nije donio svježe cijene "
            "(ili isti snapshot).\n\n"
        )
    if "price_changes_high" in warnings:
        f.write(
            "> ⚠️ **price_changes iznad praga** — provjeri je li detekcija/podatak OK "
            "prije šireg push limita.\n\n"
        )


def write_push_section(f, stats: dict | None) -> None:
    f.write("## Push\n\n")
    if not stats:
        f.write("_Nema `PUSH_STATS` reda u logu._\n\n")
        return

    f.write("| Field | Value |\n| --- | --- |\n")
    f.write(f"| ok | `{json.dumps(bool(stats.get('ok')))}` |\n")
    f.write(f"| sent | {stats.get('sent', 0)} |\n")
    f.write(f"| gone | {stats.get('gone', 0)} |\n")
    f.write(f"| failed | {stats.get('failed', 0)} |\n")
    f.write(f"| skipped_dedup | {stats.get('skipped_dedup', 0)} |\n")
    f.write(f"| candidates | {stats.get('candidates', 0)} |\n")
    f.write(f"| dry_run | `{json.dumps(bool(stats.get('dry_run')))}` |\n")
    f.write(f"| limit | {stats.get('limit')} |\n\n")

    failed = int(stats.get("failed") or 0)
    if failed > 0:
        f.write(f"> ⚠️ **failed={failed}** — pogledaj push log za greške.\n\n")


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--import-log", type=Path)
    p.add_argument("--push-log", type=Path)
    p.add_argument("--import-line")
    p.add_argument("--push-line")
    p.add_argument(
        "--out",
        type=Path,
        help="Default: $GITHUB_STEP_SUMMARY ili stdout.",
    )
    args = p.parse_args()

    import_stats = None
    if args.import_line:
        line = args.import_line.strip()
        if not line.startswith("IMPORT_STATS="):
            line = "IMPORT_STATS=" + line
        import_stats = extract_stats_line(line, "IMPORT_STATS=")
    else:
        import_stats = load_from_file(args.import_log, "IMPORT_STATS=")

    push_stats = None
    if args.push_line:
        line = args.push_line.strip()
        if not line.startswith("PUSH_STATS="):
            line = "PUSH_STATS=" + line
        push_stats = extract_stats_line(line, "PUSH_STATS=")
    else:
        push_stats = load_from_file(args.push_log, "PUSH_STATS=")

    out_path = args.out
    if out_path is None:
        env_summary = (os.getenv("GITHUB_STEP_SUMMARY") or "").strip()
        out_path = Path(env_summary) if env_summary else None

    from io import StringIO

    buf = StringIO()
    buf.write("# Regular prices crawl — monitoring\n\n")
    write_import_section(buf, import_stats)
    write_push_section(buf, push_stats)
    text = buf.getvalue()

    if out_path:
        with out_path.open("a", encoding="utf-8") as f:
            f.write(text)
    else:
        sys.stdout.write(text)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
