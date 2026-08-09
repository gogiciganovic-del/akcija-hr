import { supabase } from "./supabase";
import { adaptDeal, adaptRegularPrice } from "./adapters";
import { chainFromStoreName, CHAINS } from "./constants";
import { productPlaceholderDataUri } from "./productImage";
import { fetchOpenFoodFactsProduct } from "./openFoodFacts";

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
    barcode: code,
    priceSource: "sale",
    saleMatch: found.match,
    image: adapted.image || productPlaceholderDataUri(adapted.name, 80),
  });
}

/**
 * Pretraga naših cijena po nazivu (OFF identifikacija → naše cijene).
 * Cijene isključivo iz active_deals / regular_prices.
 */
async function searchPricesByName(offName, barcode) {
  const name = String(offName || "").trim();
  if (name.length < 3) return [];

  const norm = normalizeProductName(name);
  const words = norm.split(" ").filter((w) => w.length >= 2).slice(0, 4);
  const needle = escapeIlike(words.join(" ") || name.slice(0, 40));
  if (needle.length < 3) return [];

  const pattern = `%${needle}%`;
  const code = String(barcode || "").trim();

  const [saleRes, regRes] = await Promise.all([
    supabase
      .from("active_deals")
      .select(DEAL_COLS)
      .ilike("name", pattern)
      .order("price", { ascending: true })
      .limit(80),
    supabase
      .from("regular_prices")
      .select("barcode, name, brand, chain, price, category, special_price")
      .ilike("name", pattern)
      .order("price", { ascending: true })
      .limit(80),
  ]);

  if (saleRes.error) throw saleRes.error;
  if (regRes.error) throw regRes.error;

  /** @type {Map<string, object>} */
  const bestByChain = new Map();
  let i = 0;

  for (const row of saleRes.data || []) {
    const chain = chainFromStoreName(row.store_name);
    if (!chain || !CHAINS.includes(chain)) continue;
    const price = parseFloat(row.price);
    if (Number.isNaN(price)) continue;
    // Zahtijevaj da barem 2 riječi iz OFF naziva postoje u našem nazivu (manje lažnih pogodaka)
    const rowNorm = normalizeProductName(row.name);
    const hitWords = words.filter((w) => rowNorm.includes(w));
    if (words.length >= 2 && hitWords.length < 2) continue;
    if (words.length === 1 && hitWords.length < 1) continue;

    if (bestByChain.has(chain)) continue;
    const adapted = adaptDeal(row);
    bestByChain.set(chain, {
      ...adapted,
      id: `scan-off-sale-${chain}-${code}-${i++}`,
      chain,
      barcode: code || adapted.barcode || null,
      priceSource: "sale",
      saleMatch: "off_name",
      image: adapted.image || productPlaceholderDataUri(adapted.name, 80),
    });
  }

  for (const row of regRes.data || []) {
    const chain = row.chain;
    if (!chain || !CHAINS.includes(chain)) continue;
    if (bestByChain.has(chain)) continue;
    const price = parseFloat(row.price);
    if (Number.isNaN(price)) continue;

    const rowNorm = normalizeProductName(row.name);
    const hitWords = words.filter((w) => rowNorm.includes(w));
    if (words.length >= 2 && hitWords.length < 2) continue;
    if (words.length === 1 && hitWords.length < 1) continue;

    const adapted = adaptRegularPrice(row);
    bestByChain.set(chain, {
      ...adapted,
      id: `scan-off-regular-${chain}-${code}-${i++}`,
      chain,
      barcode: code || row.barcode || null,
      priceSource: "regular",
      saleMatch: null,
      image: productPlaceholderDataUri(row.name, 80),
    });
  }

  return [...bestByChain.values()];
}

/**
 * Lookup po barkodu.
 * 1) Naša baza (active_deals + regular_prices po EAN)
 * 2) Ako nema — Open Food Facts (samo ime/brand/slika) + pretraga naših cijena po imenu
 *
 * @returns {Promise<{ prices: object[], offIdentity: { name: string, brand: string|null, imageUrl: string|null } | null }>}
 */
export async function lookupByBarcode(barcode) {
  const code = String(barcode || "").trim();
  if (!code) return { prices: [], offIdentity: null };

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

  if (saleByBarcodeChain.size || regRows.length) {
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
          barcode: code,
          saleMatch: null,
          image: productPlaceholderDataUri(row.name, 80),
        });
      }
    }

    for (const [chain, found] of saleByBarcodeChain) {
      if (seenChains.has(chain)) continue;
      pushSaleResult(results, found, chain, code, i++);
    }

    return { prices: results, offIdentity: null };
  }

  // Lokalni EAN miss → OFF identifikacija (bez cijena iz OFF-a)
  const off = await fetchOpenFoodFactsProduct(code);
  if (!off) return { prices: [], offIdentity: null };

  try {
    const prices = await searchPricesByName(off.name, code);
    return { prices, offIdentity: off };
  } catch {
    // Naša pretraga pala — barem pokaži OFF identitet
    return { prices: [], offIdentity: off };
  }
}
