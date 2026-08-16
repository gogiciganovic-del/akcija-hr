-- Povijest promjena redovne cijene — isti obrazac kao product_size_history.
-- Upisuje import_regular_prices.py kad se price promijeni za isti barcode+chain.
--
-- Zamjenjuje legacy price_history (product_id/store_id/valid_from) koja nije
-- bila punjena iz crawla i UI ju nije koristio.

DROP TABLE IF EXISTS price_history CASCADE;

CREATE TABLE price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barcode text NOT NULL,
  chain text NOT NULL,
  old_price numeric NOT NULL,
  new_price numeric NOT NULL,
  detected_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE price_history IS
  'Detektirane promjene redovne cijene (isti barcode+chain). Bilježi se od sljedećeg crawla; bez backfilla.';

CREATE INDEX IF NOT EXISTS idx_price_history_barcode_chain
  ON price_history (barcode, chain);

CREATE INDEX IF NOT EXISTS idx_price_history_detected_at
  ON price_history (detected_at);

ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "price_history_select_public" ON price_history;
CREATE POLICY "price_history_select_public" ON price_history
  FOR SELECT TO anon, authenticated USING (true);

GRANT SELECT ON price_history TO anon, authenticated;
-- Pisanje: service_role zaobilazi RLS (scraper import).
