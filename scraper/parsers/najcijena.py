import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from urllib.parse import unquote, urlparse, parse_qs

from bs4 import BeautifulSoup

from category_map import map_category
from parsers.rsc_dates import parse_rsc_dates, resolve_validity

DEAL_PATH_RE = re.compile(r"/akcija/([a-z0-9\-]+)-(\d+)$")
PRICE_RE = re.compile(r"(\d+[.,]\d{2})")
YEAR = datetime.now().year


@dataclass
class ListingDateStats:
    """Brojači po listingu / lancu (RSC vs fallback vs skipped)."""

    real: int = 0
    fallback: int = 0
    expired_skipped: int = 0
    duration_1_3: int = 0
    duration_4_7: int = 0
    duration_8_plus: int = 0

    def note(self, source: str, *, skip: bool = False, span_days: int | None = None) -> None:
        if skip:
            self.expired_skipped += 1
            return
        if source == "rsc":
            self.real += 1
            if span_days is None:
                return
            if span_days <= 3:
                self.duration_1_3 += 1
            elif span_days <= 7:
                self.duration_4_7 += 1
            else:
                self.duration_8_plus += 1
        else:
            self.fallback += 1


@dataclass
class ScrapedDeal:
    external_id: str
    slug: str
    name: str
    brand: str | None
    category: str
    image_url: str | None
    price: float
    original_price: float
    discount_pct: int
    valid_from: datetime
    valid_until: datetime
    store_chain: str
    source_url: str
    date_source: str = "fallback"  # "rsc" | "fallback"


def _parse_price(text: str | None) -> float | None:
    if not text:
        return None
    m = PRICE_RE.search(text.replace(" ", ""))
    if not m:
        return None
    return float(m.group(1).replace(",", "."))


def _extract_image_url(img_tag) -> str | None:
    if not img_tag:
        return None
    src = img_tag.get("src") or ""
    srcset = img_tag.get("srcset") or ""
    raw = src or srcset.split(",")[-1].strip().split(" ")[0]
    if "url=" in raw:
        parsed = urlparse(raw)
        qs = parse_qs(parsed.query)
        if "url" in qs:
            return unquote(qs["url"][0])
    if raw.startswith("http"):
        return raw
    return None


def _clean_product_name(alt: str | None) -> str:
    if not alt:
        return "Nepoznat proizvod"
    name = alt.split(" - Akcija")[0].strip()
    return name or alt.strip()


def _discount_from_prices(sale: float, original: float) -> int:
    if original <= 0:
        return 0
    pct = round((1 - sale / original) * 100)
    return max(0, min(100, pct))


def parse_listing_page(
    html: str,
    store_chain: str,
    *,
    stats: ListingDateStats | None = None,
    now: datetime | None = None,
) -> list[ScrapedDeal]:
    soup = BeautifulSoup(html, "html.parser")
    deals: list[ScrapedDeal] = []
    seen: set[str] = set()
    rsc_by_id = parse_rsc_dates(html)
    n = now or datetime.now(timezone.utc)

    for card in soup.select('a.product-card[href^="/akcija/"]'):
        href = card.get("href", "")
        m = DEAL_PATH_RE.search(href)
        if not m:
            continue

        slug, ext_id = m.group(1), m.group(2)
        if ext_id in seen:
            continue
        seen.add(ext_id)

        img = card.select_one(".product-card__thumb img")
        name = _clean_product_name(img.get("alt") if img else None)

        sale_el = card.select_one(".text-price")
        orig_el = card.select_one(".regular-price")
        sale = _parse_price(sale_el.get_text() if sale_el else None)
        original = _parse_price(orig_el.get_text() if orig_el else None)

        if sale is None:
            continue
        if original is None or original < sale:
            original = round(sale / 0.7, 2) if sale else sale

        badge_el = card.select_one(".product-card__badge")
        discount = None
        if badge_el:
            digits = re.sub(r"\D", "", badge_el.get_text())
            if digits:
                discount = int(digits)

        if discount is None:
            discount = _discount_from_prices(sale, original)

        pair = rsc_by_id.get(ext_id)
        vf_d = pair[0] if pair else None
        vt_d = pair[1] if pair else None
        resolved = resolve_validity(vf_d, vt_d, now=n)
        if stats is not None:
            stats.note(
                resolved.source,
                skip=resolved.skip,
                span_days=resolved.span_days,
            )
        if resolved.skip:
            # Istekla po RSC validTo — ne ubacuj kao aktivnu (sync_deal uvijek stavlja is_active=true).
            continue

        deals.append(
            ScrapedDeal(
                external_id=ext_id,
                slug=slug,
                name=name,
                brand=None,
                category="dom",
                image_url=_extract_image_url(img),
                price=sale,
                original_price=original,
                discount_pct=discount,
                valid_from=resolved.valid_from,
                valid_until=resolved.valid_until,
                store_chain=store_chain,
                source_url=f"https://www.najcijena.hr{href}",
                date_source=resolved.source,
            )
        )

    return deals


def enrich_from_detail_html(deal: ScrapedDeal, html: str) -> ScrapedDeal:
    """Dopuni datumima i kategorijom iz JSON-LD na stranici akcije."""
    soup = BeautifulSoup(html, "html.parser")

    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string or "")
        except json.JSONDecodeError:
            continue

        graph = data.get("@graph") if isinstance(data, dict) else None
        if not graph:
            continue

        for node in graph:
            if node.get("@type") != "Product":
                continue

            offers = node.get("offers") or {}
            vf = offers.get("validFrom")
            vu = offers.get("priceValidUntil")
            if vf:
                deal.valid_from = datetime.fromisoformat(vf.replace("Z", "+00:00"))
            if vu:
                deal.valid_until = datetime.fromisoformat(vu.replace("Z", "+00:00"))

            img = node.get("image")
            if img and deal.image_url is None:
                deal.image_url = _extract_image_url_from_string(img)

    for crumb in soup.select('script[type="application/ld+json"]'):
        try:
            data = json.loads(crumb.string or "")
        except json.JSONDecodeError:
            continue
        graph = data.get("@graph") if isinstance(data, dict) else None
        if not graph:
            continue
        for node in graph:
            if node.get("@type") != "BreadcrumbList":
                continue
            items = node.get("itemListElement") or []
            for item in items:
                it = item.get("item") or {}
                name = (it.get("name") or "").strip()
                href = it.get("@id") or it.get("url") or ""
                if "/kategorija/" in href and name.lower() not in (
                    "pocetna",
                    "početna",
                    "voce i povrce",
                ):
                    deal.category = map_category(name)
                    break

    return deal


def _extract_image_url_from_string(img: str) -> str | None:
    if "url=" in img:
        parsed = urlparse(img)
        qs = parse_qs(parsed.query)
        if "url" in qs:
            return unquote(qs["url"][0])
    return img if img.startswith("http") else None
