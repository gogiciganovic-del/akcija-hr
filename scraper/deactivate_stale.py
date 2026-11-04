#!/usr/bin/env python3
"""
Last-seen gašenje starih ponuda (Faza 1: report-only).

Guard (sve mora proći):
  - fetch_ok
  - complete listing (petlja završila prirodno, nije odrezana na --pages)
  - seen > 0
  - seen >= 70% visible_before

visible_before / visible_not_seen = redovi iz active_deals semantike
(is_active AND valid_until > now()), ne sirovi is_active.

Ne koristi RSC datume. --apply je odvojen i po zadanom ISKLJUČEN.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Protocol


DEFAULT_GUARD_RATIO = 0.70


class SupabaseLike(Protocol):
    def table(self, name: str) -> Any: ...


@dataclass(frozen=True)
class ChainDeactivatePlan:
    chain: str
    store_id: str | None
    seen: int
    visible_before: int
    visible_not_seen: int
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
            f"seen={self.seen}, visible_before={self.visible_before}, "
            f"visible_not_seen={self.visible_not_seen}, "
            f"guard_ok={str(self.guard_ok).lower()}, "
            f"pages_fetched={self.pages_fetched}, "
            f"last_page_cards={self.last_page_cards}, "
            f"complete={str(self.complete).lower()}"
            + (f", reason={self.reason}" if self.reason else "")
        )


def listing_complete(
    *,
    fetch_ok: bool,
    stopped_naturally: bool,
) -> bool:
    """
    complete=True samo ako je petlja završila prirodno (nema novih ponuda)
    i fetch nije pao. Iscrpljen max_pages bez prirodnog kraja → False.
    """
    if not fetch_ok:
        return False
    return bool(stopped_naturally)


def guard_allows_deactivate(
    *,
    seen: int,
    visible_before: int,
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
    if visible_before <= 0:
        return True, None
    if seen < ratio * visible_before:
        return False, "coverage"
    return True, None


def plan_chain_deactivation(
    *,
    chain: str,
    seen: int,
    visible_before: int,
    visible_not_seen: int,
    fetch_ok: bool,
    pages_fetched: int,
    last_page_cards: int,
    complete: bool,
    store_id: str | None = None,
    ratio: float = DEFAULT_GUARD_RATIO,
) -> ChainDeactivatePlan:
    ok, reason = guard_allows_deactivate(
        seen=seen,
        visible_before=visible_before,
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
            f"last_page_cards={last_page_cards} (need natural end)"
        )
    elif reason == "seen=0":
        warning = "seen=0: skip deactivate (possible empty catalog)"
    elif reason == "coverage":
        warning = (
            f"guard_fail: seen={seen} < {ratio:.0%} of "
            f"visible_before={visible_before}"
        )

    return ChainDeactivatePlan(
        chain=chain,
        store_id=store_id,
        seen=seen,
        visible_before=visible_before,
        visible_not_seen=visible_not_seen,
        would_deactivate=visible_not_seen if ok else 0,
        guard_ok=ok,
        fetch_ok=fetch_ok,
        pages_fetched=pages_fetched,
        last_page_cards=last_page_cards,
        complete=complete,
        reason=reason,
        warning=warning,
    )


def _paginate_select(
    client: SupabaseLike,
    table: str,
    columns: str,
    *,
    eq: dict | None = None,
    gt: dict | None = None,
    lt: dict | None = None,
):
    """Simple pagination helper (1000/page)."""
    page_size = 1000
    offset = 0
    rows: list[dict] = []
    while True:
        q = client.table(table).select(columns).range(offset, offset + page_size - 1)
        if eq:
            for col, val in eq.items():
                q = q.eq(col, val)
        if gt:
            for col, val in gt.items():
                q = q.gt(col, val)
        if lt:
            for col, val in lt.items():
                q = q.lt(col, val)
        res = q.execute()
        batch = res.data or []
        rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
    return rows


def visible_deals_for_store(client: SupabaseLike, store_id: str) -> list[dict]:
    """
    Same filter as active_deals view for one store:
    is_active=true AND valid_until > now().
    """
    now_iso = datetime.now(timezone.utc).isoformat()
    return _paginate_select(
        client,
        "deals",
        "id,product_id,scraped_at,valid_until",
        eq={"store_id": store_id, "is_active": True},
        gt={"valid_until": now_iso},
    )


def count_visible_not_seen(
    rows: list[dict],
    *,
    pass_started_at: datetime,
) -> int:
    """Visible rows with scraped_at < pass_started_at (or null scraped_at)."""
    pass_utc = pass_started_at.astimezone(timezone.utc)
    n = 0
    for r in rows:
        scraped = r.get("scraped_at")
        if scraped is None:
            n += 1
            continue
        try:
            ts = datetime.fromisoformat(str(scraped).replace("Z", "+00:00"))
        except ValueError:
            n += 1
            continue
        if ts.astimezone(timezone.utc) < pass_utc:
            n += 1
    return n


def apply_deactivate_before_scraped_at(
    client: SupabaseLike,
    *,
    store_id: str,
    pass_started_at: datetime,
) -> int:
    """
    WRITE: set is_active=false for visible deals of store with scraped_at < pass start.
    Faza 1 ne zove ovo bez eksplicitnog --apply.
    """
    rows = visible_deals_for_store(client, store_id)
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
    seen: int,
    visible_before: int,
    fetch_ok: bool,
    pages_fetched: int,
    last_page_cards: int,
    complete: bool,
    pass_started_at: datetime,
    ratio: float = DEFAULT_GUARD_RATIO,
) -> ChainDeactivatePlan:
    # After save: visible rows still older than pass start = not refreshed.
    visible_now = visible_deals_for_store(client, store_id)
    visible_not_seen = count_visible_not_seen(
        visible_now, pass_started_at=pass_started_at
    )
    return plan_chain_deactivation(
        chain=chain,
        seen=seen,
        visible_before=visible_before,
        visible_not_seen=visible_not_seen,
        fetch_ok=fetch_ok,
        pages_fetched=pages_fetched,
        last_page_cards=last_page_cards,
        complete=complete,
        store_id=store_id,
        ratio=ratio,
    )
