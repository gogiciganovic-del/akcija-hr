-- Brzi EAN lookup u barcodeLookup (regular_prices.eq('barcode')).
-- Unique je (chain, barcode) pa barcode-only upit nije mogao koristiti taj indeks.

CREATE INDEX IF NOT EXISTS idx_regular_prices_barcode
  ON regular_prices (barcode);
