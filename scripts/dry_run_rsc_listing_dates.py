#!/usr/bin/env python3
"""
Dry-run: svi scraper lanci — stari now+7 vs RSC validFrom/validTo.
Lokalno, BEZ upisa u bazu.

  py -3 scripts/dry_run_rsc_listing_dates.py --pages 2
"""
from __future__ import annotations

import argparse
import re
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scraper"))

from config import BASE_URL, CHAIN_NAMES  # noqa: E402
from parsers.najcijena import ListingDateStats, parse_listing_page  # noqa: E402
from parsers.rsc_dates import parse_rsc_dates  # noqa: E402

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "hr,en;q=0.9",
}

# Redoslijed kao u scraperu / zahtjevu (mueller = Müller).
CHAINS = (
    "lidl",
    "kaufland",
    "konzum",
    "plodine",
    "spar",
    "interspar",
    "eurospin",
    "tommy",
    "studenac",
    "dm",
    "bipa",
    "mueller",
)


@dataclass
class ChainResult:
    slug: str
    stats: ListingDateStats
    considered: int
    fallback_ids: list[str]
    htmls: list[str]
    rsc_by_id: dict | None = None
    error: str | None = None


def fetch_pages(client: httpx.Client, slug: str, pages: int) -> list[str]:
    htmls: list[str] = []
    for page in range(1, pages + 1):
        url = f"{BASE_URL}/trgovina/{slug}?page={page}"
        print(f"  GET {url}")
        resp = client.get(url, headers=HEADERS, timeout=45)
        if resp.status_code == 404:
            print(f"  -> 404 stop")
            break
        resp.raise_for_status()
        if page == 1 and "product-card" not in resp.text:
            url = f"{BASE_URL}/?vendor={slug}&page={page}"
            print(f"  GET {url} (vendor fallback)")
            resp = client.get(url, headers=HEADERS, timeout=45)
            resp.raise_for_status()
        htmls.append(resp.text)
        time.sleep(0.6)
    return htmls


def _snippet_for_id(htmls: list[str], ext_id: str, radius: int = 480) -> str:
    """Pronađi id u RSC/HTML-u i vrati isječak; inače napomeni da nema."""
    needle_escaped = f'\\"id\\":{ext_id},'
    needle_raw = f'"id":{ext_id},'
    for html in htmls:
        for needle in (needle_escaped, needle_raw):
            idx = html.find(needle)
            if idx < 0:
                continue
            # Traži validFrom unutar ~1600 znakova nakon id (dugi description).
            window = html[idx : idx + 1600]
            vf_m = re.search(
                r'validFrom\\?":\\?"(\d{4}-\d{2}-\d{2})\\?"'
                r'.{0,120}?'
                r'validTo\\?":\\?"(\d{4}-\d{2}-\d{2})\\?"',
                window,
                re.DOTALL,
            )
            a = max(0, idx - 40)
            b = min(len(html), idx + radius)
            chunk = html[a:b].replace("\n", " ")
            if vf_m:
                return (
                    f"...{chunk}...  [RSC datumi u objektu: "
                    f"{vf_m.group(1)}→{vf_m.group(2)}]"
                )
            return f"...{chunk}...  [nema validFrom/validTo u ~1600 znakova nakon id]"
    for html in htmls:
        m = re.search(rf"/akcija/[^\"']*-{re.escape(ext_id)}(?:[\"'?#]|$)", html)
        if m:
            a = max(0, m.start() - 20)
            b = min(len(html), m.end() + 80)
            return f"...{html[a:b].replace(chr(10), ' ')}...  [samo card href; nema RSC id bloka]"
    return f"(id={ext_id} nije pronađen u HTML/RSC payloadu)"


def run_chain(slug: str, pages: int, now: datetime) -> ChainResult:
    chain = CHAIN_NAMES[slug]
    old_until = now + timedelta(days=7)
    stats = ListingDateStats()
    print(f"\n=== {slug.upper()} ({chain}) ===")

    with httpx.Client() as client:
        htmls = fetch_pages(client, slug, pages)

    all_deals = []
    rsc_all: dict = {}
    fallback_ids: list[str] = []
    for html in htmls:
        rsc_all.update(parse_rsc_dates(html))
        page_deals = parse_listing_page(html, chain, stats=stats, now=now)
        for d in page_deals:
            if d.date_source == "fallback":
                fallback_ids.append(d.external_id)
        all_deals.extend(page_deals)

    for d in all_deals[:8]:
        pair = rsc_all.get(d.external_id)
        rsc_s = f"{pair[0]} → {pair[1]}" if pair else "(nema RSC)"
        print(
            f"  {d.name[:44]:<44} | old: {now.date()}→{old_until.date()} "
            f"| rsc: {rsc_s} | used={d.date_source} "
            f"| until={d.valid_until.date()}"
        )

    considered = (
        stats.real
        + stats.fallback
        + stats.expired_skipped
        + stats.future_skipped
    )
    print(
        f"SAŽETAK {slug}: real={stats.real} fallback={stats.fallback} "
        f"expired_skipped={stats.expired_skipped} future_skipped={stats.future_skipped} "
        f"trajanje 1–3={stats.duration_1_3} 4–7={stats.duration_4_7} "
        f"8+={stats.duration_8_plus} considered={considered}"
    )
    return ChainResult(
        slug=slug,
        stats=stats,
        considered=considered,
        fallback_ids=fallback_ids,
        htmls=htmls,
        rsc_by_id=rsc_all,
    )


def print_table(results: list[ChainResult]) -> None:
    print("\n=== TABLICA ===")
    hdr = (
        f"{'lanac':<12} {'real':>5} {'fall':>5} {'exp':>5} {'fut':>5} "
        f"{'1-3':>5} {'4-7':>5} {'8+':>5} {'fb%':>6}"
    )
    print(hdr)
    print("-" * len(hdr))
    for r in results:
        if r.error:
            print(f"{r.slug:<12} ERROR: {r.error}")
            continue
        s = r.stats
        denom = max(1, r.considered)
        pct = 100.0 * s.fallback / denom
        print(
            f"{r.slug:<12} {s.real:5d} {s.fallback:5d} {s.expired_skipped:5d} "
            f"{s.future_skipped:5d} {s.duration_1_3:5d} {s.duration_4_7:5d} "
            f"{s.duration_8_plus:5d} {pct:5.1f}%"
        )


def print_high_fallback_snippets(results: list[ChainResult]) -> None:
    print("\n=== FALLBACK > 10%: uzroci + HTML isječci ===")
    any_hit = False
    for r in results:
        if r.error:
            continue
        denom = max(1, r.considered)
        pct = 100.0 * r.stats.fallback / denom
        if pct <= 10.0 or r.stats.fallback == 0:
            continue
        any_hit = True
        rsc = r.rsc_by_id or {}
        span_fb = sum(1 for i in r.fallback_ids if i in rsc)
        miss_fb = sum(1 for i in r.fallback_ids if i not in rsc)
        print(
            f"\n-- {r.slug} fallback={r.stats.fallback}/{r.considered} ({pct:.1f}%) "
            f"| od toga RSC-uhvaćeno-pa-policy={span_fb} regex-miss={miss_fb} --"
        )
        samples = r.fallback_ids[:3] or []
        if not samples:
            print("  (nema fallback external_id uzoraka)")
            continue
        for ext_id in samples:
            if ext_id in rsc:
                vf, vt = rsc[ext_id]
                span = (vt - vf).days
                print(
                    f"  id={ext_id}: regex OK validFrom={vf} validTo={vt} "
                    f"span={span}d → fallback (MAX_SPAN/nevaljan), ne miss regexa"
                )
            else:
                snip = _snippet_for_id(r.htmls, ext_id)
                print(f"  id={ext_id} REGEX MISS: {snip[:520]}")
    if not any_hit:
        print("(nijedan lanac nema fallback > 10%)")


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--pages", type=int, default=2)
    args = p.parse_args()
    now = datetime.now(timezone.utc)
    print(f"now_utc={now.isoformat()} pages={args.pages}")
    print(
        "Odabir: expired+future → SKIP (ne ubacuj). "
        "sync_deal uvijek is_active=true; active_deals gleda samo valid_until."
    )
    results: list[ChainResult] = []
    for slug in CHAINS:
        try:
            results.append(run_chain(slug, args.pages, now))
        except Exception as e:
            print(f"X {slug}: {e}")
            results.append(
                ChainResult(
                    slug=slug,
                    stats=ListingDateStats(),
                    considered=0,
                    fallback_ids=[],
                    htmls=[],
                    error=str(e),
                )
            )
    print_table(results)
    print_high_fallback_snippets(results)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
