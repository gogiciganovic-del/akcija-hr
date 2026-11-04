#!/usr/bin/env python3
"""
Last-seen gašenje starih ponuda (Faza 1: report-only).

Guard (sve mora proći):
  - fetch_ok
  - complete listing (nije odrezano na --pages)
  - seen > 0
  - seen >= 70% previous_active

Ne koristi RSC datume. --apply je odvojen i po zadanom ISKLJUČEN.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Protocol


DEFAULT_GUARD_RATIO = 0.70
PAGE_CARD_FULL = 50


class SupabaseLike(Protocol):
    def table(self, name: str) -> Any: ...


@dataclass(frozen=True)
class ChainDeactivatePlan:
    chain: str
    store_id: str | None
    seen: int
    previous_active: int
    would_deactivate: int
    guard_ok: bool
    fetch_ok: bool
    pages_fetched: int
    last_page_cards: int
    complete: bool
    reason: str | None = None
    warning: str | None = None

    def summary_line(self) -> str:
        return (
            f"{self.chain}: would_deactivate={self.would_deactivate}, "
            f"seen={self.seen}, previous_active={self.previous_active}, "
            f"guard_ok={str(self.guard_ok).lower()}, "
            f"pages_fetched={self.pages_fetched}, "
            f"last_page_cards={self.last_page_cards}, "
            f"complete={str(self.complete).lower()}"
            + (f", reason={self.reason}" if self.reason else "")
        )


def listing_complete(
    *,
    pages_fetched: int,
    last_page_cards: int,
    max_pages: int,
    hit_empty_page: bool,
) -> bool:
    """
    Complete when we reached the end of the listing:
    - empty page (0 cards), or
    - last page has < PAGE_CARD_FULL cards.
    Truncated when we stopped at max_pages with a full page.
    """
    if pages_fetched <= 0:
        return True  # nothing to fetch / empty store
    if hit_empty_page:
        return True
    if last_page_cards < PAGE_CARD_FULL:
        return True
    # Full last page and we hit the page cap → truncated
    if pages_fetched >= max_pages:
        return False
    return True


def guard_allows_deactivate(
    *,
    seen: int,
    previous_active: int,
    fetch_ok: bool,
    complete: bool,
    ratio: float = DEFAULT_GUARD_RATIO,
) -> tuple[bool, str | None]:
    """Returns (ok, reason). reason is set when blocked."""
    if not fetch_ok:
        return False, "fetch_error"
    if not complete:
        return False, "truncated"
    if seen <= 0:
        return False, "seen=0"
    if previous_active <= 0:
        return True, None
    if seen < ratio * previous_active:
        return False, "coverage"
    return True, None


def plan_chain_deactivation(
    *,
    chain: str,
    seen: int,
    previous_active: int,
    stale_active_count: int,
    fetch_ok: bool,
    pages_fetched: int,
    last_page_cards: int,
    complete: bool,
    store_id: str | None = None,
    ratio: float = DEFAULT_GUARD_RATIO,
) -> ChainDeactivatePlan:
    ok, reason = guard_allows_deactivate(
        seen=seen,
        previous_active=previous_active,
        fetch_ok=fetch_ok,
        complete=complete,
        ratio=ratio,
    )
    warning = None
    if reason == "fetch_error":
        warning = "fetch_error: skip deactivate"
    elif reason == "truncated":
        warning = (
            f"truncated: pages_fetched={pages_fetched} "
            f"last_page_cards={last_page_cards} (need end of list)"
        )
    elif reason == "seen=0":
        warning = "seen=0: skip deactivate (possible empty catalog)"
    elif reason == "coverage":
        warning = (
            f"guard_fail: seen={seen} < {ratio:.0%} of previous_active={previous_active}"
        )

    return ChainDeactivatePlan(
        chain=chain,
        store_id=store_id,
        seen=seen,
        previous_active=previous_active,
        would_deactivate=stale_active_count if ok else 0,
        guard_ok=ok,
        fetch_ok=fetch_ok,
        pages_fetched=pages_fetched,
        last_page_cards=last_page_cards,
        complete=complete,
        reason=reason,
        warning=warning,
    )


def _paginate_select(client: SupabaseLike, table: str, columns: str, **filters):
    """Simple pagination helper (1000/page)."""
    page_size = 1000
    offset = 0
    rows: list[dict] = []
    while True:
        q = client.table(table).select(columns).range(offset, offset + page_size - 1)
        for key, value in filters.items():
            if key == "eq":
                for col, val in value.items():
                    q = q.eq(col, val)
            elif key == "in_":
                for col, val in value.items():
                    q = q.in_(col, list(val))
        res = q.execute()
        batch = res.data or []
        rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
    return rows


def count_active_deals_for_store(client: SupabaseLike, store_id: str) -> int:
    rows = _paginate_select(
        client,
        "deals",
        "id",
        eq={"store_id": store_id, "is_active": True},
    )
    return len(rows)


def active_deals_for_store(client: SupabaseLike, store_id: str) -> list[dict]:
    return _paginate_select(
        client,
        "deals",
        "id,product_id,scraped_at",
        eq={"store_id": store_id, "is_active": True},
    )


def active_deal_product_ids_for_store(client: SupabaseLike, store_id: str) -> list[str]:
    rows = active_deals_for_store(client, store_id)
    return [r["product_id"] for r in rows if r.get("product_id")]


def count_stale_active(
    *,
    active_product_ids: list[str],
    seen_product_ids: set[str],
) -> int:
    """Active deals whose product was not seen in this pass."""
    return sum(1 for pid in active_product_ids if pid not in seen_product_ids)


def count_scraped_at_before_last_pass(rows: list[dict]) -> tuple[int, str | None]:
    """
    Among active rows, how many have scraped_at older than max(scraped_at)
    for that chain (or null scraped_at). Returns (count, last_pass_iso).
    """
    timestamps: list[datetime] = []
    parsed: list[tuple[dict, datetime | None]] = []
    for r in rows:
        scraped = r.get("scraped_at")
        if scraped is None:
            parsed.append((r, None))
            continue
        try:
            ts = datetime.fromisoformat(str(scraped).replace("Z", "+00:00"))
        except ValueError:
            parsed.append((r, None))
            continue
        timestamps.append(ts)
        parsed.append((r, ts))
    if not timestamps:
        # No scraped_at at all → all count as "older"/unknown vs last pass
        return len(rows), None
    last = max(timestamps)
    older = sum(1 for _r, ts in parsed if ts is None or ts < last)
    return older, last.isoformat()


def seen_product_ids_from_active_names(
    client: SupabaseLike,
    *,
    active_product_ids: list[str],
    seen_names: list[str],
) -> set[str]:
    """
    Read-only match: load names for currently-active product_ids, intersect
    with normalized seen listing names (same strip/lower idea as upsert cache).
    """
    if not active_product_ids or not seen_names:
        return set()
    seen_norm = {n.strip().lower() for n in seen_names if n and n.strip()}
    unique_pids = list(dict.fromkeys(active_product_ids))
    names_by_id: dict[str, str] = {}
    chunk_size = 200
    for i in range(0, len(unique_pids), chunk_size):
        chunk = unique_pids[i : i + chunk_size]
        res = client.table("products").select("id,name").in_("id", chunk).execute()
        for row in res.data or []:
            names_by_id[row["id"]] = (row.get("name") or "").strip().lower()
    return {pid for pid, name in names_by_id.items() if name in seen_norm}


def apply_deactivate_before_scraped_at(
    client: SupabaseLike,
    *,
    store_id: str,
    pass_started_at: datetime,
) -> int:
    """
    WRITE: set is_active=false for active deals of store with scraped_at < pass start.
    Faza 1 ne zove ovo bez eksplicitnog --apply.
    """
    rows = active_deals_for_store(client, store_id)
    ids = []
    pass_utc = pass_started_at.astimezone(timezone.utc)
    for r in rows:
        scraped = r.get("scraped_at")
        if scraped is None:
            ids.append(r["id"])
            continue
        try:
            ts = datetime.fromisoformat(str(scraped).replace("Z", "+00:00"))
        except ValueError:
            ids.append(r["id"])
            continue
        if ts.astimezone(timezone.utc) < pass_utc:
            ids.append(r["id"])

    if not ids:
        return 0
    chunk_size = 200
    updated = 0
    for i in range(0, len(ids), chunk_size):
        chunk = ids[i : i + chunk_size]
        client.table("deals").update({"is_active": False}).in_("id", chunk).execute()
        updated += len(chunk)
    return updated


def build_plan_for_chain(
    client: SupabaseLike,
    *,
    chain: str,
    store_id: str,
    seen_names: list[str],
    fetch_ok: bool,
    pages_fetched: int,
    last_page_cards: int,
    complete: bool,
    ratio: float = DEFAULT_GUARD_RATIO,
) -> ChainDeactivatePlan:
    active_rows = active_deals_for_store(client, store_id)
    active_pids = [r["product_id"] for r in active_rows if r.get("product_id")]
    previous_active = len(active_rows)
    seen_pids = seen_product_ids_from_active_names(
        client, active_product_ids=active_pids, seen_names=seen_names
    )
    stale = count_stale_active(
        active_product_ids=active_pids, seen_product_ids=seen_pids
    )
    return plan_chain_deactivation(
        chain=chain,
        seen=len(seen_names),
        previous_active=previous_active,
        stale_active_count=stale,
        fetch_ok=fetch_ok,
        pages_fetched=pages_fetched,
        last_page_cards=last_page_cards,
        complete=complete,
        store_id=store_id,
        ratio=ratio,
    )
