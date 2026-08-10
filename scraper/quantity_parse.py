"""Parsiranje količine i tipa proizvoda iz naziva (usklađeno s src/lib)."""

from __future__ import annotations

import re
from pathlib import Path

# Mirror of PRODUCT_TYPES matches → key (keep in sync with src/lib/productTypes.js)
# Generated subset — import from a shared JSON would be nicer later.
_PRODUCT_TYPE_MATCHES: dict[str, str] = {}


def _load_matches_from_js() -> dict[str, str]:
    """Parse matches from src/lib/productTypes.js (no Node required)."""
    root = Path(__file__).resolve().parent.parent
    js_path = root / "src" / "lib" / "productTypes.js"
    text = js_path.read_text(encoding="utf-8")
    out: dict[str, str] = {}
    # { key: "kruh", ... matches: ["KRUH", "kruh"] }
    for block in re.finditer(
        r'\{\s*key:\s*"([^"]+)"\s*,\s*label:\s*"[^"]*"\s*,\s*matches:\s*\[([^\]]*)\]',
        text,
    ):
        key = block.group(1)
        raw = block.group(2)
        for m in re.findall(r'"([^"]+)"', raw):
            out[m.upper()] = key
    return out


def get_match_map() -> dict[str, str]:
    global _PRODUCT_TYPE_MATCHES
    if not _PRODUCT_TYPE_MATCHES:
        _PRODUCT_TYPE_MATCHES = _load_matches_from_js()
    return _PRODUCT_TYPE_MATCHES


UNIT_MAP = {
    "g": "g",
    "gr": "g",
    "grama": "g",
    "gram": "g",
    "kg": "kg",
    "kila": "kg",
    "ml": "ml",
    "mililitara": "ml",
    "mililitar": "ml",
    "l": "L",
    "lit": "L",
    "litara": "L",
    "litra": "L",
    "litre": "L",
}

_QTY_RE = re.compile(
    r"(?:\bcca|\bca|\bapprox\.?)?\s*(\d+(?:[.,]\d+)?)\s*"
    r"(kg|g|gr|grama|gram|ml|mililitara|mililitar|l|lit|litara|litra|litre)\b",
    re.IGNORECASE,
)


def parse_quantity_from_name(name: str | None) -> tuple[float | None, str | None]:
    """Vrati (quantity_value, quantity_unit) ili (None, None)."""
    if not name:
        return None, None
    best: tuple[float, str] | None = None
    for m in _QTY_RE.finditer(str(name)):
        try:
            value = float(m.group(1).replace(",", "."))
        except ValueError:
            continue
        if value <= 0:
            continue
        unit = UNIT_MAP.get(m.group(2).lower())
        if not unit:
            continue
        best = (value, unit)
    if not best:
        return None, None
    return best[0], best[1]


def match_product_type(name: str | None) -> str | None:
    if not name:
        return None
    first = str(name).strip().split()[0] if str(name).strip() else ""
    if not first:
        return None
    return get_match_map().get(first.upper())


def enrich_from_name(name: str | None) -> dict:
    qv, qu = parse_quantity_from_name(name)
    return {
        "quantity_value": qv,
        "quantity_unit": qu,
        "product_type": match_product_type(name),
    }
