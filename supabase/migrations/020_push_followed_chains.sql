-- Faza 1: praćenje lanaca za "novi letak" push (Eurospin, Kaufland, Plodine).
-- Aditivno: ne mijenja upsert_push_subscription ni delete_push_subscription.
-- Brisanje pretplate (delete_push_subscription / ON DELETE CASCADE) briše i
-- push_flyer_notifications za taj subscription_id.

-- ---------------------------------------------------------------------------
-- 1) followed_chains na push_subscriptions
-- ---------------------------------------------------------------------------

ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS followed_chains text[] NOT NULL DEFAULT '{}';

-- Max 3; samo dopušteni lanci (čisti ponedjeljak signal).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'push_subscriptions_followed_chains_cap'
  ) THEN
    ALTER TABLE push_subscriptions
      ADD CONSTRAINT push_subscriptions_followed_chains_cap
      CHECK (cardinality(followed_chains) <= 3);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'push_subscriptions_followed_chains_allowed'
  ) THEN
    ALTER TABLE push_subscriptions
      ADD CONSTRAINT push_subscriptions_followed_chains_allowed
      CHECK (
        followed_chains <@ ARRAY['Eurospin', 'Kaufland', 'Plodine']::text[]
      );
  END IF;
END $$;

COMMENT ON COLUMN push_subscriptions.followed_chains IS
  'Lanci koje uređaj prati za „novi letak“ (max 3: Eurospin, Kaufland, Plodine).';

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_followed_chains
  ON push_subscriptions USING gin (followed_chains);

-- ---------------------------------------------------------------------------
-- 2) RPC: update_push_followed_chains
--    upsert_push_subscription / update_push_tracked_barcodes / delete_push_subscription
--    ostaju netaknuti (nema CREATE OR REPLACE na njima u ovoj migraciji).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_push_followed_chains(
  p_endpoint text,
  p_chains text[] DEFAULT '{}'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chains text[];
  v_allowed constant text[] := ARRAY['Eurospin', 'Kaufland', 'Plodine'];
BEGIN
  IF p_endpoint IS NULL OR length(trim(p_endpoint)) = 0 THEN
    RAISE EXCEPTION 'endpoint required';
  END IF;

  v_chains := COALESCE(p_chains, '{}')::text[];

  IF cardinality(v_chains) > 3 THEN
    RAISE EXCEPTION 'followed_chains max 3';
  END IF;

  IF NOT (v_chains <@ v_allowed) THEN
    RAISE EXCEPTION 'followed_chains allowed: Eurospin, Kaufland, Plodine';
  END IF;

  UPDATE push_subscriptions
  SET
    followed_chains = v_chains,
    updated_at = now()
  WHERE endpoint = trim(p_endpoint);
END;
$$;

REVOKE ALL ON FUNCTION update_push_followed_chains(text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_push_followed_chains(text, text[]) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Log poslanih flyer pusheva (dedup: 1 po pretplati / lanac / tjedan)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS push_flyer_notifications (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id   uuid NOT NULL
                    REFERENCES push_subscriptions(id) ON DELETE CASCADE,
  chain             text NOT NULL,
  flyer_week        text NOT NULL,
  sent_at           timestamptz NOT NULL DEFAULT now(),

  UNIQUE (subscription_id, chain, flyer_week),

  CONSTRAINT push_flyer_notifications_chain_allowed CHECK (
    chain = ANY (ARRAY['Eurospin', 'Kaufland', 'Plodine']::text[])
  )
);

CREATE INDEX IF NOT EXISTS idx_push_flyer_notif_sub_chain_week
  ON push_flyer_notifications (subscription_id, chain, flyer_week);

COMMENT ON TABLE push_flyer_notifications IS
  'Log poslanih „novi letak“ pusheva; UNIQUE(subscription_id, chain, flyer_week) = max 1/tjedan/uređaj/lanac.';

ALTER TABLE push_flyer_notifications ENABLE ROW LEVEL SECURITY;
-- Bez policy za anon/authenticated — pristup samo service_role (zaobilazi RLS).

GRANT ALL ON push_flyer_notifications TO service_role;
