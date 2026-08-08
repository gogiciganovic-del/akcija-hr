-- Uključi RLS na svim tablicama u public shemi + politike za čitanje kataloga.
-- Scraper (service_role) zaobilazi RLS. Anon/authenticated: samo SELECT na katalog.

ALTER TABLE deals ADD COLUMN IF NOT EXISTS scraped_at timestamptz;

-- ── RLS na svim public tablicama ─────────────────────────────────────────────
DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
  END LOOP;
END $$;

-- ── Katalog: javno čitanje (app, anon ključ) ─────────────────────────────────
DROP POLICY IF EXISTS "stores_select_public" ON stores;
CREATE POLICY "stores_select_public" ON stores
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "products_select_public" ON products;
CREATE POLICY "products_select_public" ON products
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "deals_select_public" ON deals;
CREATE POLICY "deals_select_public" ON deals
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "price_history_select_public" ON price_history;
CREATE POLICY "price_history_select_public" ON price_history
  FOR SELECT TO anon, authenticated USING (true);

-- ── Favoriti: samo vlastiti zapisi (ako tablica postoji) ─────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'user_favorites'
  ) THEN
    DROP POLICY IF EXISTS "user_favorites_select_own" ON user_favorites;
    CREATE POLICY "user_favorites_select_own" ON user_favorites
      FOR SELECT TO authenticated USING (auth.uid() = user_id);

    DROP POLICY IF EXISTS "user_favorites_insert_own" ON user_favorites;
    CREATE POLICY "user_favorites_insert_own" ON user_favorites
      FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

    DROP POLICY IF EXISTS "user_favorites_update_own" ON user_favorites;
    CREATE POLICY "user_favorites_update_own" ON user_favorites
      FOR UPDATE TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);

    DROP POLICY IF EXISTS "user_favorites_delete_own" ON user_favorites;
    CREATE POLICY "user_favorites_delete_own" ON user_favorites
      FOR DELETE TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

-- ── View: mora DROP + CREATE (REPLACE ne dopušta promjenu stupaca/redoslijeda) ─
DROP VIEW IF EXISTS active_deals;

CREATE VIEW active_deals
WITH (security_invoker = true)
AS
SELECT
  d.id              AS deal_id,
  p.id              AS product_id,
  p.name,
  p.brand,
  s.name            AS store_name,
  p.category,
  d.original_price,
  d.price,
  d.discount_pct,
  p.image_url,
  d.valid_from,
  d.valid_until,
  d.created_at,
  d.scraped_at
FROM deals d
JOIN products p ON p.id = d.product_id
JOIN stores s   ON s.id = d.store_id
WHERE d.is_active = true
  AND d.valid_until > now();

-- ── Dozvole: samo SELECT za klijente ─────────────────────────────────────────
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
GRANT SELECT ON stores, products, deals, price_history TO anon, authenticated;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'user_favorites'
  ) THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON user_favorites TO authenticated;
  END IF;
END $$;
GRANT SELECT ON active_deals TO anon, authenticated;
GRANT EXECUTE ON FUNCTION deals_near_me(double precision, double precision, double precision)
  TO anon, authenticated;
