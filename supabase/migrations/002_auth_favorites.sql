-- Pokreni u Supabase SQL Editor nakon schema.sql
-- Tablica favorita vezanih za auth.users

CREATE TABLE IF NOT EXISTS user_favorites (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  deal_id       text NOT NULL,
  product_data  jsonb NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, deal_id)
);

CREATE INDEX IF NOT EXISTS idx_user_favorites_user ON user_favorites(user_id);

ALTER TABLE user_favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_favorites_select_own" ON user_favorites;
CREATE POLICY "user_favorites_select_own" ON user_favorites
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_favorites_insert_own" ON user_favorites;
CREATE POLICY "user_favorites_insert_own" ON user_favorites
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_favorites_delete_own" ON user_favorites;
CREATE POLICY "user_favorites_delete_own" ON user_favorites
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

GRANT SELECT, INSERT, DELETE ON user_favorites TO authenticated;
