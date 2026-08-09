import { supabase } from "./supabase";
import { adaptDeal, adaptRegularPrice } from "./adapters";
import { chainFromStoreName } from "./constants";
import { productPlaceholderDataUri } from "./productImage";

/** Normalizacija naziva za usporedbu (trim, lower, bez dijakritika, bez suvišne interpunkcije). */
export function normalizeProductName(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeIlike(s) {
  return String(s || "").replace(/[%_,]/g, "");
}

const DEAL_COLS =
  "deal_id, product_id, name, brand, barcode, store_name, price, original_price, discount_pct, image_url, category, valid_until, scraped_at";

/**
 * Pronađi akciju za lanac: prvo točan naziv, zatim soft match.
 * Ne dira cartCompare — samo skener lookup.
 */
async function findSaleForChain(name, chain) {
  const exactName = (name || "").trim();
  if (!exactName) return null;

  const { data: exactRows, error: exactErr } = await supabase
    .from("active_deals")
    .select(DEAL_COLS)
    .eq("name", exactName)
    .order("price", { ascending: true })
    .limit(40);

  if (exactErr) throw exactErr;

  for (const row of exactRows || []) {
    if (chainFromStoreName(row.store_name) !== chain) continue;
    const price = parseFloat(row.price);
    if (Number.isNaN(price)) continue;
    return { row, match: "exact" };
  }

  const normTarget = normalizeProductName(exactName);
  if (normTarget.length < 4) return null;

  const words = normTarget.split(" ").filter(Boolean).slice(0, 3);
  const needle = escapeIlike(words.join(" "));
  if (needle.length < 3) return null;

  const { data: softRows, error: softErr } = await supabase
    .from("active_deals")
    .select(DEAL_COLS)
    .ilike("name", `%${needle}%`)
    .order("price", { ascending: true })
    .limit(40);

  if (softErr) throw softErr;

  for (const row of softRows || []) {
    if (chainFromStoreName(row.store_name) !== chain) continue;
    if (normalizeProductName(row.name) !== normTarget) continue;
    const price = parseFloat(row.price);
    if (Number.isNaN(price)) continue;
    return { row, match: "soft" };
  }

  return null;
}

function pushSaleResult(results, found, chain, code, i) {
  const adapted = adaptDeal(found.row);
  results.push({
    ...adapted,
    id: `scan-sale-${chain}-${code}-${i}`,
    chain,
    priceSource: "sale",
    saleMatch: found.match,
    image: adapted.image || productPlaceholderDataUri(adapted.name, 80),
  });
}

/**
 * Lookup po barkodu:
 * 1) active_deals po točnom barkodu (kad je povezan u bazi)
 * 2) regular_prices po barkodu
 * 3) za lance bez akcijskog barkoda — stari fallback (naziv exact/soft)
 * Ako nema ništa — [].
 */
export async function lookupByBarcode(barcode) {
  const code = String(barcode || "").trim();
  if (!code) return [];

  const [saleRes, regRes] = await Promise.all([
    supabase
      .from("active_deals")
      .select(DEAL_COLS)
      .eq("barcode", code)
      .order("price", { ascending: true })
      .limit(40),
    supabase
      .from("regular_prices")
      .select("barcode, name, brand, chain, price, category, special_price")
      .eq("barcode", code)
      .order("price", { ascending: true }),
  ]);

  if (saleRes.error) throw saleRes.error;
  if (regRes.error) throw regRes.error;

  /** @type {Map<string, { row: object, match: string }>} */
  const saleByBarcodeChain = new Map();
  for (const row of saleRes.data || []) {
    const chain = chainFromStoreName(row.store_name);
    if (!chain) continue;
    if (Number.isNaN(parseFloat(row.price))) continue;
    if (!saleByBarcodeChain.has(chain)) {
      saleByBarcodeChain.set(chain, { row, match: "barcode" });
    }
  }

  const regRows = regRes.data || [];
  if (!saleByBarcodeChain.size && !regRows.length) return [];

  const results = [];
  const seenChains = new Set();
  let i = 0;

  for (const row of regRows) {
    const chain = row.chain;
    seenChains.add(chain);
    const byBarcode = saleByBarcodeChain.get(chain);

    if (byBarcode) {
      pushSaleResult(results, byBarcode, chain, code, i++);
      continue;
    }

    const exactName = (row.name || "").trim();
    const found = exactName ? await findSaleForChain(exactName, chain) : null;

    if (found) {
      pushSaleResult(results, found, chain, code, i++);
    } else {
      const adapted = adaptRegularPrice(row);
      results.push({
        ...adapted,
        id: `scan-regular-${chain}-${code}-${i++}`,
        saleMatch: null,
        image: productPlaceholderDataUri(row.name, 80),
      });
    }
  }

  // Akcije povezane barkodom u lancima bez retka u regular_prices
  for (const [chain, found] of saleByBarcodeChain) {
    if (seenChains.has(chain)) continue;
    pushSaleResult(results, found, chain, code, i++);
  }

  return results;
}
