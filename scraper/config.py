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
