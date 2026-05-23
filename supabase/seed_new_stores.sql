-- Dodaj 6 novih lanaca (pokreni u Supabase SQL Editoru ako scraper jos nije kreirao trgovine)
INSERT INTO stores (name, chain, city, lat, lng)
SELECT v.name, v.chain, 'Zagreb', 45.815, 15.982
FROM (VALUES
  ('Tommy Zagreb',     'Tommy'),
  ('Interspar Zagreb', 'Interspar'),
  ('Dm Zagreb',        'Dm'),
  ('Studenac Zagreb',  'Studenac'),
  ('Mueller Zagreb',   'Mueller'),
  ('Bipa Zagreb',      'Bipa')
) AS v(name, chain)
WHERE NOT EXISTS (
  SELECT 1 FROM stores s WHERE s.chain = v.chain
);
