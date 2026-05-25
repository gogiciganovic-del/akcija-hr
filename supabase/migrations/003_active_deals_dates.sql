-- Polja za filtere "Novo" i "Danas ističe" na početnoj stranici
CREATE OR REPLACE VIEW active_deals AS
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
  d.created_at
FROM deals d
JOIN products p ON p.id = d.product_id
JOIN stores s   ON s.id = d.store_id
WHERE d.is_active = true
  AND d.valid_until > now();
