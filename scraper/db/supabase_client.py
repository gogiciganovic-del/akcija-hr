from __future__ import annotations

from supabase import create_client, Client

from config import SUPABASE_URL, SUPABASE_KEY
from parsers.najcijena import ScrapedDeal


class SupabaseWriter:
    def __init__(self):
        if not SUPABASE_URL or not SUPABASE_KEY:
            raise RuntimeError(
                "Postavi SUPABASE_URL i SUPABASE_SERVICE_ROLE_KEY u .env "
                "(service role za upis — anon ključ nema INSERT dozvole)."
            )
        self.client: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
        self._store_cache: dict[str, str] = {}
        self._product_cache: dict[str, str] = {}

    def get_store_id(self, chain: str) -> str:
        if chain in self._store_cache:
            return self._store_cache[chain]

        res = (
            self.client.table("stores")
            .select("id")
            .eq("chain", chain)
            .limit(1)
            .execute()
        )
        if not res.data:
            inserted = (
                self.client.table("stores")
                .insert(
                    {
                        "name": f"{chain} Hrvatska",
                        "chain": chain,
                        "city": "Zagreb",
                        "lat": 45.815,
                        "lng": 15.982,
                    }
                )
                .execute()
            )
            store_id = inserted.data[0]["id"]
            self._store_cache[chain] = store_id
            return store_id
        store_id = res.data[0]["id"]
        self._store_cache[chain] = store_id
        return store_id

    def upsert_product(self, deal: ScrapedDeal) -> str:
        cache_key = deal.name.strip().lower()
        if cache_key in self._product_cache:
            return self._product_cache[cache_key]

        existing = (
            self.client.table("products")
            .select("id")
            .ilike("name", deal.name.strip())
            .limit(1)
            .execute()
        )
        if existing.data:
            product_id = existing.data[0]["id"]
            self.client.table("products").update(
                {
                    "brand": deal.brand,
                    "category": deal.category,
                    "image_url": deal.image_url,
                }
            ).eq("id", product_id).execute()
        else:
            inserted = (
                self.client.table("products")
                .insert(
                    {
                        "name": deal.name.strip(),
                        "brand": deal.brand,
                        "category": deal.category,
                        "image_url": deal.image_url,
                    }
                )
                .execute()
            )
            product_id = inserted.data[0]["id"]

        self._product_cache[cache_key] = product_id
        return product_id

    def sync_deal(self, deal: ScrapedDeal, store_id: str, product_id: str) -> None:
        self.client.table("deals").update({"is_active": False}).eq(
            "store_id", store_id
        ).eq("product_id", product_id).eq("is_active", True).execute()

        self.client.table("deals").insert(
            {
                "product_id": product_id,
                "store_id": store_id,
                "price": deal.price,
                "original_price": deal.original_price,
                "discount_pct": deal.discount_pct,
                "valid_from": deal.valid_from.isoformat(),
                "valid_until": deal.valid_until.isoformat(),
                "is_active": True,
            }
        ).execute()

    def save_deals(self, deals: list[ScrapedDeal]) -> dict:
        stats = {"products": 0, "deals": 0, "errors": 0}
        for deal in deals:
            try:
                store_id = self.get_store_id(deal.store_chain)
                product_id = self.upsert_product(deal)
                self.sync_deal(deal, store_id, product_id)
                stats["products"] += 1
                stats["deals"] += 1
            except Exception as exc:
                stats["errors"] += 1
                print(f"  ✗ {deal.name}: {exc}")
        return stats
