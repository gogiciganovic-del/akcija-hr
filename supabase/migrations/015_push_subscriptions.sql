-- Push pretplate (Web Push) — uređaj se identificira endpointom (capability token).
-- tracked_barcodes sinkronizira klijent iz localStorage favorita (kasniji korak).
--
-- Sigurnost bez auth.users:
--   • Nema javnog SELECT-a → nema enumeracije endpointa / ključeva.
--   • INSERT/UPDATE/DELETE za anon: tko zna endpoint može ažurirati taj red
--     (endpoint je dugački tajni URL od push servisa — nije pogodan za pogađanje).
--   • service_role zaobilazi RLS (slanje obavijesti u budućnosti).

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint         text NOT NULL UNIQUE,
  p256dh           text NOT NULL,
  auth             text NOT NULL,
  tracked_barcodes text[] NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT push_subscriptions_endpoint_nonempty CHECK (length(trim(endpoint)) > 0),
  CONSTRAINT push_subscriptions_p256dh_nonempty CHECK (length(trim(p256dh)) > 0),
  CONSTRAINT push_subscriptions_auth_nonempty CHECK (length(trim(auth)) > 0),
  CONSTRAINT push_subscriptions_barcodes_cap CHECK (cardinality(tracked_barcodes) <= 500)
);

COMMENT ON TABLE push_subscriptions IS
  'Web Push pretplate. endpoint je tajni identifikator uređaja; tracked_barcodes = barkodovi koje uređaj prati.';

COMMENT ON COLUMN push_subscriptions.tracked_barcodes IS
  'Barkodovi sinkronizirani iz klijentskih favorita (localStorage).';

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_tracked_barcodes
  ON push_subscriptions USING gin (tracked_barcodes);

CREATE OR REPLACE FUNCTION push_subscriptions_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_push_subscriptions_updated_at ON push_subscriptions;
CREATE TRIGGER trg_push_subscriptions_updated_at
  BEFORE UPDATE ON push_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION push_subscriptions_set_updated_at();

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Bez SELECT politike za anon/authenticated: ne može se listati/curiti pretplate.
DROP POLICY IF EXISTS "push_subscriptions_insert_anon" ON push_subscriptions;
CREATE POLICY "push_subscriptions_insert_anon" ON push_subscriptions
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "push_subscriptions_update_anon" ON push_subscriptions;
CREATE POLICY "push_subscriptions_update_anon" ON push_subscriptions
  FOR UPDATE TO anon, authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "push_subscriptions_delete_anon" ON push_subscriptions;
CREATE POLICY "push_subscriptions_delete_anon" ON push_subscriptions
  FOR DELETE TO anon, authenticated
  USING (true);

REVOKE ALL ON push_subscriptions FROM anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON push_subscriptions TO anon, authenticated;
-- SELECT namjerno nije grantan klijentima (service_role i dalje čita za slanje).
