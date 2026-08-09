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

/**
 * Pronađi akciju za lanac: prvo točan naziv, zatim soft match (ista normalizirana vrijednost).
 * Ne dira cartCompare — samo skener lookup.
 */
async function findSaleForChain(name, chain) {
  const exactName = (name || "").trim();
  if (!exactName) return null;

  const { data: exactRows, error: exactErr } = await supabase
    .from("active_deals")
    .select(
      "deal_id, product_id, name, store_name, price, original_price, discount_pct, image_url, category"
    )
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

  // Kandidati: prve 2–3 riječi (dovoljno usko da ne raznese free tier)
  const words = normTarget.split(" ").filter(Boolean).slice(0, 3);
  const needle = escapeIlike(words.join(" "));
  if (needle.length < 3) return null;

  const { data: softRows, error: softErr } = await supabase
    .from("active_deals")
    .select(
      "deal_id, product_id, name, store_name, price, original_price, discount_pct, image_url, category"
    )
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

/** Lookup cijena po točnom barkodu: regular_prices → active_deals po nazivu+lancu (exact pa soft). */
export async function lookupByBarcode(barcode) {
  const code = String(barcode || "").trim();
  if (!code) return [];

  const { data: regRows, error } = await supabase
    .from("regular_prices")
    .select("barcode, name, brand, chain, price, category, special_price")
    .eq("barcode", code)
    .order("price", { ascending: true });

  if (error) throw error;
  if (!regRows?.length) return [];

  const results = [];
  for (let i = 0; i < regRows.length; i++) {
    const row = regRows[i];
    const exactName = (row.name || "").trim();
    const found = exactName ? await findSaleForChain(exactName, row.chain) : null;

    if (found) {
      const adapted = adaptDeal(found.row);
      results.push({
        ...adapted,
        id: `scan-sale-${row.chain}-${code}-${i}`,
        chain: row.chain,
        priceSource: "sale",
        saleMatch: found.match,
        image: adapted.image || productPlaceholderDataUri(adapted.name, 80),
      });
    } else {
      const adapted = adaptRegularPrice(row);
      results.push({
        ...adapted,
        id: `scan-regular-${row.chain}-${code}-${i}`,
        saleMatch: null,
        image: productPlaceholderDataUri(row.name, 80),
      });
    }
  }
  return results;
}
