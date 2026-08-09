-- Korak 3: poveži products.barcode iz regular_prices — SAMO pouzdani pogodci.
-- Pravilo:
--   1) točan naziv (lower + trim)
--   2) isti lanac kao na aktivnoj akciji (stores.chain = regular_prices.chain)
--   3) za taj proizvod postoji TOČNO JEDAN različiti barkod
--   4) products.barcode je trenutno prazan
-- Ako je sumnjivo (više barkodova) → NE diraj (bolje prazno nego krivo).

WITH product_chains AS (
  SELECT DISTINCT
    p.id AS product_id,
    lower(trim(p.name)) AS name_key,
    s.chain AS chain
  FROM products p
  JOIN deals d ON d.product_id = p.id
  JOIN stores s ON s.id = d.store_id
  WHERE p.barcode IS NULL
    AND d.is_active = true
    AND length(trim(p.name)) >= 3
    AND s.chain IS NOT NULL
),
matched AS (
  SELECT
    pc.product_id,
    count(DISTINCT r.barcode) AS barcode_count,
    min(r.barcode) AS barcode
  FROM product_chains pc
  JOIN regular_prices r
    ON r.chain = pc.chain
   AND lower(trim(r.name)) = pc.name_key
  WHERE r.barcode IS NOT NULL
    AND length(trim(r.barcode)) >= 8
  GROUP BY pc.product_id
  HAVING count(DISTINCT r.barcode) = 1
)
UPDATE products p
SET barcode = m.barcode
FROM matched m
WHERE p.id = m.product_id
  AND p.barcode IS NULL;
