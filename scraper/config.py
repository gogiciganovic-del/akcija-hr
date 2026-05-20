import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).parent
load_dotenv(ROOT.parent / ".env")
load_dotenv(ROOT / ".env")

BASE_URL = "https://www.najcijena.hr"

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("VITE_SUPABASE_ANON_KEY")

STORE_SLUGS = {
    "lidl": "lidl",
    "kaufland": "kaufland",
    "konzum": "konzum",
    "spar": "spar",
    "plodine": "plodine",
    "eurospin": "eurospin",
}

CHAIN_NAMES = {
    "lidl": "Lidl",
    "kaufland": "Kaufland",
    "konzum": "Konzum",
    "spar": "Spar",
    "plodine": "Plodine",
    "eurospin": "Eurospin",
}
