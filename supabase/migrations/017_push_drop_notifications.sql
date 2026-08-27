-- Log poslanih push obavijesti za pad cijene (dedup + cooldown).
-- Piše scraper/send_price_drop_pushes.py (service_role).

CREATE TABLE IF NOT EXISTS push_drop_notifications (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id   uuid NOT NULL
                    REFERENCES push_subscriptions(id) ON DELETE CASCADE,
  price_history_id  uuid NOT NULL
                    REFERENCES price_history(id) ON DELETE CASCADE,
  barcode           text NOT NULL,
  chain             text NOT NULL,
  old_price         numeric NOT NULL,
  new_price         numeric NOT NULL,
  sent_at           timestamptz NOT NULL DEFAULT now(),

  UNIQUE (subscription_id, price_history_id)
);

CREATE INDEX IF NOT EXISTS idx_push_drop_notif_sub_barcode_chain_sent
  ON push_drop_notifications (subscription_id, barcode, chain, sent_at DESC);

COMMENT ON TABLE push_drop_notifications IS
  'Log poslanih push obavijesti za pad cijene; hard dedup po price_history_id i cooldown po barcode+chain.';

ALTER TABLE push_drop_notifications ENABLE ROW LEVEL SECURITY;
-- Bez policy za anon/authenticated — pristup samo service_role (zaobilazi RLS).

GRANT ALL ON push_drop_notifications TO service_role;
