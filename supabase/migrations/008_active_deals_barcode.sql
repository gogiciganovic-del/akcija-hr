-- Korak 2: active_deals pokazuje barcode s products (može biti NULL).
-- Stari SELECT-i i dalje rade — samo se dodaje jedan stupac.

DROP VIEW IF EXISTS active_deals;

CREATE VIEW active_deals
WITH (security_invoker = true)
AS
SELECT
  d.id              AS deal_id,
  p.id              AS product_id,
  p.name,
  p.brand,
  p.barcode,
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

GRANT SELECT ON active_deals TO anon, authenticated;
