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

function saleNeedleForName(name) {
  const normTarget = normalizeProductName(name);
  if (normTarget.length < 4) return null;
  const words = normTarget.split(" ").filter(Boolean).slice(0, 3);
  const needle = escapeIlike(words.join(" "));
  if (needle.length < 3) return null;
  return needle;
}

function matchExactSale(exactRows, exactName, chain) {
  for (const row of exactRows || []) {
    if ((row.name || "").trim() !== exactName) continue;
    if (chainFromStoreName(row.store_name) !== chain) continue;
    const price = parseFloat(row.price);
    if (Number.isNaN(price)) continue;
    return { row, match: "exact" };
  }
  return null;
}

function matchSoftSale(softRows, exactName, chain) {
  const normTarget = normalizeProductName(exactName);
  if (normTarget.length < 4) return null;
  for (const row of softRows || []) {
    if (chainFromStoreName(row.store_name) !== chain) continue;
    if (normalizeProductName(row.name) !== normTarget) continue;
    const price = parseFloat(row.price);
    if (Number.isNaN(price)) continue;
    return { row, match: "soft" };
  }
  return null;
}

/**
 * Akcija po nazivu za letke bez EAN-a: jedan exact .in(name), pa po potrebi jedan ILIKE.
 * Filtriranje lanca ostaje u JS-u — ista semantika kao stari findSaleForChain.
 */
async function findSalesByNameBatched(needNameRows) {
  const uniqueNames = [
    ...new Set(
      needNameRows
        .map((row) => (row.name || "").trim())
        .filter(Boolean)
    ),
  ];

  let exactRows = [];
  if (uniqueNames.length) {
    const { data, error } = await supabase
      .from("active_deals")
      .select(DEAL_COLS)
      .in("name", uniqueNames)
      .order("price", { ascending: true })
      .limit(Math.min(1000, Math.max(80, uniqueNames.length * 40)));
    if (error) throw error;
    exactRows = data || [];
  }

  /** @type {Map<string, { row: object, match: string }>} */
  const foundByChain = new Map();
  const missing = [];
  for (const row of needNameRows) {
    const chain = row.chain;
    const exactName = (row.name || "").trim();
    if (!exactName) continue;
    const exact = matchExactSale(exactRows, exactName, chain);
    if (exact) foundByChain.set(chain, exact);
    else missing.push({ chain, exactName });
  }

  if (!missing.length) return foundByChain;

  const needles = [
    ...new Set(missing.map((m) => saleNeedleForName(m.exactName)).filter(Boolean)),
  ];
  let softRows = [];
  if (needles.length === 1) {
    const { data, error } = await supabase
      .from("active_deals")
      .select(DEAL_COLS)
      .ilike("name", `%${needles[0]}%`)
      .order("price", { ascending: true })
      .limit(Math.min(1000, 40 * needles.length));
    if (error) throw error;
    softRows = data || [];
  } else if (needles.length > 1) {
    const orFilter = needles.map((n) => `name.ilike."%${n}%"`).join(",");
    const { data, error } = await supabase
      .from("active_deals")
      .select(DEAL_COLS)
      .or(orFilter)
      .order("price", { ascending: true })
      .limit(Math.min(1000, 40 * needles.length));
    if (error) throw error;
    softRows = data || [];
  }

  for (const { chain, exactName } of missing) {
    if (foundByChain.has(chain)) continue;
    const soft = matchSoftSale(softRows, exactName, chain);
    if (soft) foundByChain.set(chain, soft);
  }

  return foundByChain;
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

    const needNameRows = [];
    for (const row of regRows) {
      if (saleByBarcodeChain.has(row.chain)) continue;
      needNameRows.push(row);
    }
    const foundByName = needNameRows.length
      ? await findSalesByNameBatched(needNameRows)
      : new Map();

    for (const row of regRows) {
      const chain = row.chain;
      seenChains.add(chain);
      const byBarcode = saleByBarcodeChain.get(chain);
      if (byBarcode) {
        pushSaleResult(results, byBarcode, chain, code, i++);
        continue;
      }
      const found = foundByName.get(chain) || null;
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
