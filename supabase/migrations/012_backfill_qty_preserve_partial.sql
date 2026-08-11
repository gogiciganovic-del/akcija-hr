-- Preserve quantity_value when key absent (za --types-only partial update).
-- Prije: ELSE NULL je brisao količinu ako payload ima samo product_type.

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
      WHEN r.elem ? 'quantity_value' THEN NULL
      ELSE rp.quantity_value
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
  'Batch update quantity/type by id. Omits preserve existing columns when keys absent.';
