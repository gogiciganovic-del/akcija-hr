-- Povijest promjena gramaže (šrinkflacija) — samo pipeline, bez UI-ja.
-- Upisuje import_regular_prices.py kad se quantity_value promijeni za isti barcode+chain.

CREATE TABLE IF NOT EXISTS product_size_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barcode text NOT NULL,
  chain text NOT NULL,
  old_quantity numeric NOT NULL,
  new_quantity numeric NOT NULL,
  unit text NOT NULL,
  old_name text,
  new_name text,
  old_price numeric,
  new_price numeric,
  detected_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE product_size_history IS
  'Detektirane promjene gramaže/količine (isti barcode+chain). Bez UI-ja — za buduću šrinkflacijsku analitiku.';

CREATE INDEX IF NOT EXISTS idx_product_size_history_barcode_chain
  ON product_size_history (barcode, chain);

CREATE INDEX IF NOT EXISTS idx_product_size_history_detected_at
  ON product_size_history (detected_at);

ALTER TABLE product_size_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "product_size_history_select_public" ON product_size_history;
CREATE POLICY "product_size_history_select_public" ON product_size_history
  FOR SELECT TO anon, authenticated USING (true);

GRANT SELECT ON product_size_history TO anon, authenticated;
-- Pisanje: service_role zaobilazi RLS (scraper import).
