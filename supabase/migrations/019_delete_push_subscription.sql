-- Brisanje vlastite push pretplate (gumb Isključi).
-- ON DELETE CASCADE na push_drop_notifications.subscription_id
-- (017_push_drop_notifications.sql) briše i logove za taj red.

CREATE OR REPLACE FUNCTION delete_push_subscription(p_endpoint text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_endpoint IS NULL OR length(trim(p_endpoint)) = 0 THEN
    RAISE EXCEPTION 'endpoint required';
  END IF;

  DELETE FROM push_subscriptions
  WHERE endpoint = trim(p_endpoint);
END;
$$;

REVOKE ALL ON FUNCTION delete_push_subscription(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delete_push_subscription(text) TO anon, authenticated;
