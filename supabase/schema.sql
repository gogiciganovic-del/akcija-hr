-- akcije.hr — početna shema baze
-- Pokreni u Supabase: SQL Editor → New query → Paste → Run

-- ─────────────────────────────────────────────
-- TABLICE
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS stores (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  chain       text NOT NULL,
  city        text NOT NULL DEFAULT 'Zagreb',
  lat         double precision NOT NULL,
  lng         double precision NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  brand       text,
  category    text NOT NULL,
  image_url   text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS deals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  store_id        uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  price           numeric(10, 2) NOT NULL CHECK (price >= 0),
  original_price  numeric(10, 2) NOT NULL CHECK (original_price >= 0),
  discount_pct    integer NOT NULL DEFAULT 0 CHECK (discount_pct >= 0 AND discount_pct <= 100),
  valid_from      timestamptz NOT NULL DEFAULT now(),
  valid_until     timestamptz NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deals_price_lt_original CHECK (price <= original_price)
);

CREATE TABLE IF NOT EXISTS price_history (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  store_id        uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  price           numeric(10, 2) NOT NULL,
  original_price  numeric(10, 2) NOT NULL,
  discount_pct    integer NOT NULL DEFAULT 0,
  valid_from      timestamptz NOT NULL,
  valid_until     timestamptz NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────
-- INDEKSI
-- ─────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand);
CREATE INDEX IF NOT EXISTS idx_deals_active ON deals(is_active, valid_until) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_deals_product ON deals(product_id);
CREATE INDEX IF NOT EXISTS idx_deals_store ON deals(store_id);
CREATE INDEX IF NOT EXISTS idx_price_history_product ON price_history(product_id, valid_from DESC);
CREATE INDEX IF NOT EXISTS idx_stores_location ON stores(lat, lng);

-- ─────────────────────────────────────────────
-- VIEW: active_deals (koristi useProducts, Admin)
-- ─────────────────────────────────────────────

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
  d.valid_until
FROM deals d
JOIN products p ON p.id = d.product_id
JOIN stores s   ON s.id = d.store_id
WHERE d.is_active = true
  AND d.valid_until > now();

-- ─────────────────────────────────────────────
-- RPC: deals_near_me (koristi useProximity)
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION deals_near_me(
  user_lat  double precision,
  user_lng  double precision,
  radius_km double precision DEFAULT 5
)
RETURNS TABLE (
  deal_id         uuid,
  product_id      uuid,
  name            text,
  brand           text,
  store_name      text,
  category        text,
  original_price  numeric,
  price           numeric,
  discount_pct    integer,
  image_url       text,
  valid_until     timestamptz,
  distance_km     double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ad.deal_id,
    ad.product_id,
    ad.name,
    ad.brand,
    ad.store_name,
    ad.category,
    ad.original_price,
    ad.price,
    ad.discount_pct,
    ad.image_url,
    ad.valid_until,
    (
      6371 * acos(
        LEAST(1.0, GREATEST(-1.0,
          cos(radians(user_lat)) * cos(radians(s.lat))
          * cos(radians(s.lng) - radians(user_lng))
          + sin(radians(user_lat)) * sin(radians(s.lat))
        ))
      )
    ) AS distance_km
  FROM active_deals ad
  JOIN deals d ON d.id = ad.deal_id
  JOIN stores s ON s.id = d.store_id
  WHERE (
    6371 * acos(
      LEAST(1.0, GREATEST(-1.0,
        cos(radians(user_lat)) * cos(radians(s.lat))
        * cos(radians(s.lng) - radians(user_lng))
        + sin(radians(user_lat)) * sin(radians(s.lat))
      ))
    )
  ) <= radius_km
  ORDER BY distance_km ASC, ad.discount_pct DESC;
$$;

-- ─────────────────────────────────────────────
-- RLS — javno čitanje za anon ključ
-- ─────────────────────────────────────────────

ALTER TABLE stores        ENABLE ROW LEVEL SECURITY;
ALTER TABLE products      ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals         ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;

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

GRANT SELECT ON stores, products, deals, price_history TO anon, authenticated;
GRANT SELECT ON active_deals TO anon, authenticated;
GRANT EXECUTE ON FUNCTION deals_near_me(double precision, double precision, double precision) TO anon, authenticated;

-- ─────────────────────────────────────────────
-- DEMO PODACI (Zagreb) — pokreće se samo ako je baza prazna
-- ─────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM stores LIMIT 1) THEN
    RAISE NOTICE 'Demo podaci već postoje — preskačem seed.';
    RETURN;
  END IF;

  INSERT INTO stores (name, chain, city, lat, lng) VALUES
    ('Lidl Zagreb Centar',     'Lidl',      'Zagreb', 45.8131, 15.9770),
    ('Kaufland Slavonska',     'Kaufland',  'Zagreb', 45.8020, 16.0010),
    ('Spar Trešnjevka',        'Spar',      'Zagreb', 45.7980, 15.9450),
    ('Konzum Ilica',           'Konzum',    'Zagreb', 45.8120, 15.9680),
    ('Eurospin Dubrava',       'Eurospin',  'Zagreb', 45.8250, 16.0420),
    ('Plodine Novi Zagreb',    'Plodine',   'Zagreb', 45.7800, 15.9900);

  INSERT INTO products (name, brand, category, image_url) VALUES
    ('Nutella 750g',              'Nutella',    'slatkisi',    'https://images.unsplash.com/photo-1599599810769-74a4a03225f2?w=400'),
    ('Nike Air Max 90',           'Nike',       'obuca',       'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400'),
    ('Samsung Galaxy A55',        'Samsung',    'elektronika', 'https://images.unsplash.com/photo-1610945415295-d9bbf067e59c?w=400'),
    ('Dyson V15 Detect',          'Dyson',      'dom',         'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400'),
    ('Lavazza Qualità Oro 250g',  'Lavazza',    'pice',        'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=400'),
    ('Pileća prsa 1kg',           'PIK Vrbovec','meso',        'https://images.unsplash.com/photo-1604503468505-8c4c7c4e4e4e?w=400'),
    ('Dukatos jogurt 1kg',        'Dukatos',    'mlijecno',    'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=400'),
    ('Whiskas 1.4kg',             'Whiskas',    'kemija',      'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=400'),
    ('Barilla tjestenina 500g',   'Barilla',    'tjestenina',  'https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=400'),
    ('AirPods Pro 2',             'Apple',      'elektronika', 'https://images.unsplash.com/photo-1606220945770-b5b6c2c55bf1?w=400'),
    ('Zvijezda ulje 1L',          'Zvijezda',   'ulja',        'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=400'),
    ('Konzum kruh pšenični',      'Konzum',     'pekarski',    'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400');

  INSERT INTO deals (product_id, store_id, price, original_price, discount_pct, valid_until)
SELECT
  p.id,
  s.id,
  v.price,
  v.original_price,
  v.discount_pct,
  now() + interval '7 days'
FROM (VALUES
  ('Nutella 750g',             'Lidl',      4.99,  9.99,  50),
  ('Nike Air Max 90',          'Kaufland',  89.99, 149.99, 40),
  ('Samsung Galaxy A55',     'Konzum',    399.99, 549.99, 27),
  ('Dyson V15 Detect',       'Kaufland',  449.99, 699.99, 36),
  ('Lavazza Qualità Oro 250g','Spar',      3.49,  6.99,  50),
  ('Pileća prsa 1kg',        'Lidl',      5.99,  9.49,  37),
  ('Dukatos jogurt 1kg',     'Konzum',    1.99,  3.29,  40),
  ('Whiskas 1.4kg',          'Plodine',   6.99,  10.99, 36),
  ('Barilla tjestenina 500g','Eurospin',  0.99,  1.79,  45),
  ('AirPods Pro 2',          'Konzum',    199.99, 279.99, 29),
  ('Zvijezda ulje 1L',       'Spar',      2.49,  4.29,  42),
  ('Konzum kruh pšenični',   'Konzum',    0.79,  1.29,  39),
  ('Nutella 750g',           'Kaufland',  5.49,  9.99,  45),
  ('Samsung Galaxy A55',     'Lidl',      379.99, 549.99, 31),
  ('Pileća prsa 1kg',        'Spar',      6.49,  9.49,  32)
) AS v(product_name, chain, price, original_price, discount_pct)
  JOIN products p ON p.name = v.product_name
  JOIN stores s   ON s.chain = v.chain;

  INSERT INTO price_history (product_id, store_id, price, original_price, discount_pct, valid_from, valid_until)
  SELECT
    p.id,
    s.id,
    h.price,
    h.original_price,
    h.discount_pct,
    now() - interval '30 days',
    now() - interval '1 day'
  FROM (VALUES
    ('Nutella 750g',    'Lidl',     5.99, 9.99, 40),
    ('Nutella 750g',    'Kaufland', 6.49, 9.99, 35),
    ('Nike Air Max 90', 'Kaufland', 119.99, 149.99, 20)
  ) AS h(product_name, chain, price, original_price, discount_pct)
  JOIN products p ON p.name = h.product_name
  JOIN stores s   ON s.chain = h.chain;

END $$;
