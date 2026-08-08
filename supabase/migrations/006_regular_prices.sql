-- Trenutne redovne cijene iz zakonskih cjenika (NN 75/2025).
-- Jedan red = lanac × barkod (min cijena po danu), bez dnevne povijesti.

CREATE TABLE IF NOT EXISTS regular_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain text NOT NULL,
  barcode text NOT NULL,
  product_id text,
  name text NOT NULL,
  brand text,
  category text,
  unit text,
  quantity text,
  price numeric(10, 2) NOT NULL,
  special_price numeric(10, 2),
  unit_price numeric(10, 2),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chain, barcode)
);

CREATE INDEX IF NOT EXISTS idx_regular_prices_name_ilike
  ON regular_prices (name text_pattern_ops);

CREATE INDEX IF NOT EXISTS idx_regular_prices_chain
  ON regular_prices (chain);

ALTER TABLE regular_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "regular_prices_select_public" ON regular_prices;
CREATE POLICY "regular_prices_select_public" ON regular_prices
  FOR SELECT TO anon, authenticated USING (true);

GRANT SELECT ON regular_prices TO anon, authenticated;
