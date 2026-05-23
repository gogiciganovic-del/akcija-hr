#!/usr/bin/env python3
"""Download store logos from najcijena.hr (CDN w=256 image on each /trgovina/{slug} page)."""
from __future__ import annotations

import re
import sys
from pathlib import Path
from urllib.parse import unquote

import httpx

from config import CHAIN_NAMES, STORE_SLUGS

BASE = "https://najcijena.hr"
OUT = Path(__file__).resolve().parent.parent / "public" / "stores"
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}


def logo_url_for_slug(client: httpx.Client, slug: str) -> str | None:
    resp = client.get(f"{BASE}/trgovina/{slug}", headers=HEADERS, timeout=30)
    resp.raise_for_status()
    html = resp.text.replace("&amp;", "&")
    for m in re.finditer(r'/_next/image\?url=([^&"]+)&w=256', html):
        raw = unquote(m.group(1))
        if "cdn.najcijena.hr" in raw and "/images/" in raw:
            return raw
    return None


def main(slugs: list[str] | None = None) -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    targets = slugs or list(STORE_SLUGS.keys())

    with httpx.Client(follow_redirects=True) as client:
        for slug in targets:
            chain = CHAIN_NAMES.get(slug, slug)
            logo = logo_url_for_slug(client, slug)
            if not logo:
                print(f"FAIL {slug}: logo not found")
                continue
            filename = f"{slug}.png"
            dest = OUT / filename
            data = client.get(logo, headers=HEADERS, timeout=30).content
            dest.write_bytes(data)
            print(f"OK {chain} -> {dest.name} ({len(data)} bytes)")
    return 0


if __name__ == "__main__":
    only = sys.argv[1:] if len(sys.argv) > 1 else None
    raise SystemExit(main(only))
