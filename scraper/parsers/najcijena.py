import json
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from urllib.parse import unquote, urlparse, parse_qs

from bs4 import BeautifulSoup

from category_map import map_category

DEAL_PATH_RE = re.compile(r"/akcija/([a-z0-9\-]+)-(\d+)$")
PRICE_RE = re.compile(r"(\d+[.,]\d{2})")
YEAR = datetime.now().year


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


def parse_listing_page(html: str, store_chain: str) -> list[ScrapedDeal]:
    soup = BeautifulSoup(html, "html.parser")
    deals: list[ScrapedDeal] = []
    seen: set[str] = set()

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
                valid_from=datetime.now(timezone.utc),
                valid_until=datetime.now(timezone.utc) + timedelta(days=7),
                store_chain=store_chain,
                source_url=f"https://www.najcijena.hr{href}",
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
