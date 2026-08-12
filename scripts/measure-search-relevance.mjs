/**
 * Prije/poslije: top 5 pretrage po cijeni vs relevantnosti.
 * Usage: node scripts/measure-search-relevance.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { sortBySearchRelevance, scoreSearchRelevance, RELEVANCE } from "../src/lib/searchRelevance.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnv() {
  const raw = readFileSync(resolve(root, ".env"), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const k = m[1].trim().replace(/^\uFEFF/, "");
    let v = m[2].trim().replace(/^"|"$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnv();

const sb = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

function sortOldPrice(list) {
  const sales = list.filter((p) => p.priceSource === "sale");
  const regular = list.filter((p) => p.priceSource !== "sale");
  const byPrice = (a, b) => (a.salePrice ?? 0) - (b.salePrice ?? 0);
  return [...sales.sort(byPrice), ...regular.sort(byPrice)];
}

async function fetchMerged(term) {
  const [dealsRes, regRes] = await Promise.all([
    sb
      .from("active_deals")
      .select("name, brand, price, original_price, discount_pct, store_name, category")
      .or(`name.ilike.%${term}%,brand.ilike.%${term}%`)
      .limit(80),
    sb
      .from("regular_prices")
      .select("name, brand, chain, price, special_price, category")
      .or(`name.ilike.%${term}%,brand.ilike.%${term}%`)
      .limit(80),
  ]);

  const sale = (dealsRes.data || [])
    .map((row, i) => ({
      id: `sale-${i}`,
      name: row.name,
      brand: row.brand,
      salePrice: Number(row.price),
      priceSource: "sale",
      store: row.store_name,
      discount: row.discount_pct,
    }))
    .filter((p) => p.salePrice > 0);

  const regular = (regRes.data || [])
    .map((row, i) => ({
      id: `reg-${i}`,
      name: row.name,
      brand: row.brand,
      salePrice: Number(row.special_price ?? row.price),
      priceSource: "regular",
      chain: row.chain,
    }))
    .filter((p) => p.salePrice > 0);

  return [...sale, ...regular];
}

const SCORE_LABEL = {
  [RELEVANCE.NAME_STARTS]: "start",
  [RELEVANCE.NAME_WORD]: "word",
  [RELEVANCE.NAME_WORD_AFTER_OTHER]: "after-other",
  [RELEVANCE.BRAND_ONLY]: "brand",
  [RELEVANCE.SUBSTRING_ONLY]: "substring",
  [RELEVANCE.NONE]: "?",
};

function top5(label, list, term) {
  console.log(`  ${label}:`);
  for (const p of list.slice(0, 5)) {
    const sc = scoreSearchRelevance(p.name, p.brand, term);
    const src = p.priceSource === "sale" ? "A" : "R";
    const price = p.salePrice?.toFixed(2) ?? "?";
    console.log(
      `    [${SCORE_LABEL[sc] || sc}|${src}|€${price}] ${(p.name || "").slice(0, 58)}`
    );
  }
}

const TERMS = ["kruh", "kava", "voda", "mlijeko", "sir"];

for (const term of TERMS) {
  const all = await fetchMerged(term);
  const before = sortOldPrice(all);
  const after = sortBySearchRelevance(all, term);
  console.log(`\n=== "${term}" (${all.length} ukupno) ===`);
  top5("PRIJE (cijena, akcije prvo)", before, term);
  top5("POSLIJE (podudaranje)", after, term);
}
