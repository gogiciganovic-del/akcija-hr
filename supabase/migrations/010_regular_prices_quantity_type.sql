-- Korak 1: polja za €/kg usporedbu (parser + backfill u koraku 2).
-- quantity_value / quantity_unit = parsano iz name (npr. 0.75 + L)
-- product_type = ključ iz PRODUCT_TYPES (npr. kruh, mlijeko)

ALTER TABLE regular_prices
  ADD COLUMN IF NOT EXISTS quantity_value numeric,
  ADD COLUMN IF NOT EXISTS quantity_unit text,
  ADD COLUMN IF NOT EXISTS product_type text;

COMMENT ON COLUMN regular_prices.quantity_value IS
  'Numerička količina iz naziva (npr. 0.75 za 0,75 L). NULL ako nije prepoznato.';

COMMENT ON COLUMN regular_prices.quantity_unit IS
  'Jedinica količine: g, kg, ml, L (normalizirano). NULL ako nije prepoznato.';

COMMENT ON COLUMN regular_prices.product_type IS
  'Tip proizvoda (ključ iz PRODUCT_TYPES), npr. kruh, mlijeko. NULL ako nije prepoznato.';

CREATE INDEX IF NOT EXISTS idx_regular_prices_product_type
  ON regular_prices (product_type)
  WHERE product_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_regular_prices_chain_type
  ON regular_prices (chain, product_type)
  WHERE product_type IS NOT NULL;
