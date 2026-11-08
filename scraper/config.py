import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).parent
load_dotenv(ROOT.parent / ".env")
load_dotenv(ROOT / ".env")

BASE_URL = "https://najcijena.hr"

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = (
    os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    or os.getenv("SUPABASE_KEY")
    or os.getenv("VITE_SUPABASE_ANON_KEY")
)

STORE_SLUGS = {
    "lidl": "lidl",
    "kaufland": "kaufland",
    "konzum": "konzum",
    "spar": "spar",
    "plodine": "plodine",
    "eurospin": "eurospin",
    "tommy": "tommy",
    "interspar": "interspar",
    "dm": "dm",
    "studenac": "studenac",
    "mueller": "mueller",
    "bipa": "bipa",
}

CHAIN_NAMES = {
    "lidl": "Lidl",
    "kaufland": "Kaufland",
    "konzum": "Konzum",
    "spar": "Spar",
    "plodine": "Plodine",
    "eurospin": "Eurospin",
    "tommy": "Tommy",
    "interspar": "Interspar",
    "dm": "Dm",
    "studenac": "Studenac",
    "mueller": "Mueller",
    "bipa": "Bipa",
}

STORES = list(STORE_SLUGS.keys())

# Default listing depth when --pages is not passed on CLI.
DEFAULT_PAGES = 3
BIGGER_PAGES = 12
# Slugovi (isti ključevi kao STORE_SLUGS) s dubljim katalogom na NajCijeni.
BIGGER_PAGE_CHAINS = frozenset(
    {
        "lidl",
        "kaufland",
        "konzum",
        "plodine",
        "spar",
        "interspar",
    }
)


def pages_for_store(store_slug: str, pages_override: int | None = None) -> int:
    """
    CLI --pages (pages_override) ima prednost kad je izričito zadan.
    Inače: 12 za BIGGER_PAGE_CHAINS, inače DEFAULT_PAGES (3).
    """
    if pages_override is not None:
        return pages_override
    if store_slug in BIGGER_PAGE_CHAINS:
        return BIGGER_PAGES
    return DEFAULT_PAGES
