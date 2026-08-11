-- Batch UPDATE za backfill quantity/type (bez nullanja ostalih stupaca).
-- Poziv: select backfill_regular_prices_qty('[{"id":"...","quantity_value":1,"quantity_unit":"L","product_type":"mlijeko"}, ...]'::jsonb);

CREATE OR REPLACE FUNCTION public.backfill_regular_prices_qty(rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer := 0;
BEGIN
  IF rows IS NULL OR jsonb_typeof(rows) <> 'array' OR jsonb_array_length(rows) = 0 THEN
    RETURN 0;
  END IF;

  UPDATE regular_prices AS rp
  SET
    quantity_value = CASE
      WHEN r.elem ? 'quantity_value'
       AND r.elem->>'quantity_value' IS NOT NULL
       AND r.elem->>'quantity_value' <> 'null'
      THEN (r.elem->>'quantity_value')::numeric
      ELSE NULL
    END,
    quantity_unit = CASE
      WHEN r.elem ? 'quantity_unit' THEN nullif(r.elem->>'quantity_unit', 'null')
      ELSE rp.quantity_unit
    END,
    product_type = CASE
      WHEN r.elem ? 'product_type' THEN nullif(r.elem->>'product_type', 'null')
      ELSE rp.product_type
    END
  FROM jsonb_array_elements(rows) AS r(elem)
  WHERE rp.id = (r.elem->>'id')::uuid;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

COMMENT ON FUNCTION public.backfill_regular_prices_qty(jsonb) IS
  'Batch update quantity_value/quantity_unit/product_type by id. Used by scraper/backfill_quantity_type.py';

REVOKE ALL ON FUNCTION public.backfill_regular_prices_qty(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.backfill_regular_prices_qty(jsonb) TO service_role;
