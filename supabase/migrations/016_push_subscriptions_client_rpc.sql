-- PostgREST zahtijeva table-level SELECT i za INSERT/UPDATE/DELETE.
-- Bez SELECT politike RLS i dalje blokira čitanje (enumeracija endpointa nije moguća).
-- Dodatno: SECURITY DEFINER RPC-ovi za pouzdan upsert/update bez oslanjanja na RETURNING.

GRANT SELECT ON push_subscriptions TO anon, authenticated;

CREATE OR REPLACE FUNCTION upsert_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_tracked_barcodes text[] DEFAULT '{}'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_endpoint IS NULL OR length(trim(p_endpoint)) = 0 THEN
    RAISE EXCEPTION 'endpoint required';
  END IF;
  IF p_p256dh IS NULL OR length(trim(p_p256dh)) = 0 THEN
    RAISE EXCEPTION 'p256dh required';
  END IF;
  IF p_auth IS NULL OR length(trim(p_auth)) = 0 THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  INSERT INTO push_subscriptions (endpoint, p256dh, auth, tracked_barcodes)
  VALUES (
    trim(p_endpoint),
    trim(p_p256dh),
    trim(p_auth),
    COALESCE(p_tracked_barcodes, '{}')::text[]
  )
  ON CONFLICT (endpoint) DO UPDATE SET
    p256dh = EXCLUDED.p256dh,
    auth = EXCLUDED.auth,
    tracked_barcodes = EXCLUDED.tracked_barcodes,
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION update_push_tracked_barcodes(
  p_endpoint text,
  p_tracked_barcodes text[] DEFAULT '{}'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_endpoint IS NULL OR length(trim(p_endpoint)) = 0 THEN
    RAISE EXCEPTION 'endpoint required';
  END IF;

  UPDATE push_subscriptions
  SET
    tracked_barcodes = COALESCE(p_tracked_barcodes, '{}')::text[],
    updated_at = now()
  WHERE endpoint = trim(p_endpoint);
END;
$$;

REVOKE ALL ON FUNCTION upsert_push_subscription(text, text, text, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION update_push_tracked_barcodes(text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION upsert_push_subscription(text, text, text, text[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION update_push_tracked_barcodes(text, text[]) TO anon, authenticated;
