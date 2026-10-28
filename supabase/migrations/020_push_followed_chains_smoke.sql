-- SMOKE TEST za 020_push_followed_chains.sql (ručno u SQL Editoru).
-- Pokreni TEK NAKON što je 020_push_followed_chains.sql primijenjena
-- (lokalno / staging). Cijeli test je u BEGIN … ROLLBACK — ništa ne ostaje
-- u bazi, ni kad neki korak padne.
--
-- Napomena: u Supabase SQL Editoru pokreni cijeli fajl odjednom (jedna sesija).

BEGIN;

-- ---------------------------------------------------------------------------
-- A) Priprema: test pretplata
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_endpoint text := 'https://smoke-test.invalid/push/020-followed-chains';
  v_id uuid;
BEGIN
  DELETE FROM push_subscriptions WHERE endpoint = v_endpoint;

  INSERT INTO push_subscriptions (endpoint, p256dh, auth, tracked_barcodes)
  VALUES (v_endpoint, 'smoke-p256dh', 'smoke-auth', '{}')
  RETURNING id INTO v_id;

  RAISE NOTICE 'A ok: subscription_id=%', v_id;
END $$;

-- ---------------------------------------------------------------------------
-- B) RPC: valjani lanci (max 3)
-- ---------------------------------------------------------------------------
SELECT update_push_followed_chains(
  'https://smoke-test.invalid/push/020-followed-chains',
  ARRAY['Eurospin', 'Kaufland', 'Plodine']::text[]
);

DO $$
DECLARE
  v_chains text[];
BEGIN
  SELECT followed_chains INTO v_chains
  FROM push_subscriptions
  WHERE endpoint = 'https://smoke-test.invalid/push/020-followed-chains';

  IF v_chains IS DISTINCT FROM ARRAY['Eurospin', 'Kaufland', 'Plodine']::text[] THEN
    RAISE EXCEPTION 'B fail: expected 3 chains, got %', v_chains;
  END IF;
  RAISE NOTICE 'B ok: followed_chains=%', v_chains;
END $$;

-- ---------------------------------------------------------------------------
-- C) RPC: odbij nepoznati lanac
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    PERFORM update_push_followed_chains(
      'https://smoke-test.invalid/push/020-followed-chains',
      ARRAY['Lidl']::text[]
    );
    RAISE EXCEPTION 'C fail: Lidl should be rejected';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM LIKE '%followed_chains allowed%' THEN
        RAISE NOTICE 'C ok: rejected Lidl (% )', SQLERRM;
      ELSE
        RAISE;
      END IF;
  END;
END $$;

-- ---------------------------------------------------------------------------
-- D) RPC: odbij >3 (duplikati da prođu allowed, padnu na cap)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    PERFORM update_push_followed_chains(
      'https://smoke-test.invalid/push/020-followed-chains',
      ARRAY['Eurospin', 'Kaufland', 'Plodine', 'Eurospin']::text[]
    );
    RAISE EXCEPTION 'D fail: 4 elements should be rejected';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM LIKE '%followed_chains max 3%' THEN
        RAISE NOTICE 'D ok: rejected >3 (% )', SQLERRM;
      ELSE
        RAISE;
      END IF;
  END;
END $$;

-- ---------------------------------------------------------------------------
-- E) upsert_push_subscription NE briše followed_chains
-- ---------------------------------------------------------------------------
SELECT upsert_push_subscription(
  'https://smoke-test.invalid/push/020-followed-chains',
  'smoke-p256dh-2',
  'smoke-auth-2',
  ARRAY['111']::text[]
);

DO $$
DECLARE
  v_chains text[];
  v_bars text[];
BEGIN
  SELECT followed_chains, tracked_barcodes INTO v_chains, v_bars
  FROM push_subscriptions
  WHERE endpoint = 'https://smoke-test.invalid/push/020-followed-chains';

  IF v_chains IS DISTINCT FROM ARRAY['Eurospin', 'Kaufland', 'Plodine']::text[] THEN
    RAISE EXCEPTION 'E fail: upsert wiped followed_chains → %', v_chains;
  END IF;
  IF v_bars IS DISTINCT FROM ARRAY['111']::text[] THEN
    RAISE EXCEPTION 'E fail: tracked_barcodes not updated → %', v_bars;
  END IF;
  RAISE NOTICE 'E ok: upsert left followed_chains intact';
END $$;

-- ---------------------------------------------------------------------------
-- F) push_flyer_notifications UNIQUE + CASCADE brisanje
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_id uuid;
  v_cnt int;
BEGIN
  SELECT id INTO v_id
  FROM push_subscriptions
  WHERE endpoint = 'https://smoke-test.invalid/push/020-followed-chains';

  INSERT INTO push_flyer_notifications (subscription_id, chain, flyer_week)
  VALUES (v_id, 'Eurospin', '2026-W43');

  BEGIN
    INSERT INTO push_flyer_notifications (subscription_id, chain, flyer_week)
    VALUES (v_id, 'Eurospin', '2026-W43');
    RAISE EXCEPTION 'F fail: duplicate week should violate UNIQUE';
  EXCEPTION
    WHEN unique_violation THEN
      RAISE NOTICE 'F1 ok: UNIQUE(subscription_id, chain, flyer_week)';
  END;

  -- delete_push_subscription (netaknut RPC) → CASCADE na flyer log
  PERFORM delete_push_subscription(
    'https://smoke-test.invalid/push/020-followed-chains'
  );

  SELECT count(*) INTO v_cnt FROM push_subscriptions
  WHERE endpoint = 'https://smoke-test.invalid/push/020-followed-chains';
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'F2 fail: subscription still exists';
  END IF;

  SELECT count(*) INTO v_cnt FROM push_flyer_notifications
  WHERE subscription_id = v_id;
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'F3 fail: flyer rows not cascaded';
  END IF;

  RAISE NOTICE 'F2/F3 ok: delete_push_subscription cascaded flyer rows';
END $$;

-- ---------------------------------------------------------------------------
-- G) RLS: anon nema pristup push_flyer_notifications (očekivano fail ako
--    se pokrene kao role anon; u SQL Editoru kao postgres/service_role
--    ovaj blok samo dokumentira očekivanje).
-- ---------------------------------------------------------------------------
-- SET ROLE anon;
-- SELECT * FROM push_flyer_notifications;  -- treba: permission denied / 0 polica
-- RESET ROLE;

SELECT '020 smoke: A–F passed (will ROLLBACK)' AS result;

ROLLBACK;
