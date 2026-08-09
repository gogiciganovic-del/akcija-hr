-- Korak 1: opcionalni barkod na proizvodu (nullable).
-- Stara app i dalje radi — polje smije biti prazno.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS barcode text;

COMMENT ON COLUMN products.barcode IS
  'EAN/GTIN kad je poznat; NULL ako nije povezan. Ne dira postojeće tokove.';

-- Brza pretraga po barkodu kad ga kasnije punimo (korak 3–4).
CREATE INDEX IF NOT EXISTS idx_products_barcode
  ON products (barcode)
  WHERE barcode IS NOT NULL;
