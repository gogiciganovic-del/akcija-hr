/**
 * Prije/poslije: findSaleExact točan naziv vs očišćeni letak-sufiks.
 * Join: svi active_deals × regular_prices istog lanca po normalizeDealNameKey.
 *
 * Usage: node scripts/measure-sale-suffix-match.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { chainFromStoreName } from "../src/lib/constants.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const SAMPLE = Number(process.env.SAMPLE_SIZE || 300);
const REVIEW = Number(process.env.REVIEW_SIZE || 30);
const PAGE = 1000;

function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}
loadEnv(resolve(root, ".env"));

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("Missing Supabase URL/key in .env");
  process.exit(1);
}
const sb = createClient(url, key);

function stripDealNameSuffix(name) {
  return String(name || "")
    .replace(/\s+akcija\s+u\s+trgovini\s+.+$/i, "")
    .trim();
}

function normalizeDealNameKey(name) {
  return stripDealNameSuffix(name).toLowerCase().replace(/\s+/g, " ").trim();
}

function parsePrice(v) {
  const n = parseFloat(v);
  return Number.isNaN(n) ? null : n;
}

function hasFlyerSuffix(name) {
  return /\s+akcija\s+u\s+trgovini\s+.+$/i.test(String(name || ""));
}

function sampleStable(arr, n, seed = 42) {
  const a = [...arr];
  let s = seed >>> 0;
  for (let i = a.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, Math.min(n, a.length));
}

function sortByPrice(list) {
  return [...list].sort((a, b) => {
    const pa = parsePrice(a.price) ?? Infinity;
    const pb = parsePrice(b.price) ?? Infinity;
    return pa - pb;
  });
}

async function fetchAll(table, select, extra = async (q) => q) {
  const rows = [];
  let from = 0;
  while (true) {
    let q = sb.from(table).select(select).range(from, from + PAGE - 1);
    q = await extra(q);
    const { data, error } = await q;
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

async function fetchCatalogForChain(chain) {
  const rows = [];
  let from = 0;
  while (true) {
    const { data, error } = await sb
      .from("regular_prices")
      .select("name, chain, barcode, price, brand")
      .eq("chain", chain)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

console.log("Loading active_deals…");
const dealsRaw = await fetchAll(
  "active_deals",
  "name, store_name, price, original_price, barcode"
);

const deals = dealsRaw
  .map((d) => {
    const chain = chainFromStoreName(d.store_name);
    return {
      ...d,
      chain,
      stripped: stripDealNameSuffix(d.name),
      key: normalizeDealNameKey(d.name),
      hasSuffix: hasFlyerSuffix(d.name),
    };
  })
  .filter((d) => d.chain && d.key);

const dealChains = [...new Set(deals.map((d) => d.chain))].sort();
const withSuffix = deals.filter((d) => d.hasSuffix).length;

console.log(
  JSON.stringify(
    {
      dealsTotal: dealsRaw.length,
      dealsUsable: deals.length,
      dealsWithFlyerSuffix: withSuffix,
      suffixPct: Math.round((1000 * withSuffix) / deals.length) / 10,
      dealChains,
    },
    null,
    2
  )
);

// Index deals by chain+exact name and chain+norm key
/** @type {Map<string, object[]>} */
const dealExact = new Map();
/** @type {Map<string, object[]>} */
const dealNorm = new Map();
for (const d of deals) {
  const ek = `${d.chain}\0${d.name}`;
  if (!dealExact.has(ek)) dealExact.set(ek, []);
  dealExact.get(ek).push(d);
  const nk = `${d.chain}\0${d.key}`;
  if (!dealNorm.has(nk)) dealNorm.set(nk, []);
  dealNorm.get(nk).push(d);
}
for (const map of [dealExact, dealNorm]) {
  for (const [k, list] of map) map.set(k, sortByPrice(list));
}

console.log("Loading regular_prices per deal-chain (full)…");
/** @type {object[]} */
const lookups = [];
const seenLookup = new Set();

for (const chain of dealChains) {
  const catalog = await fetchCatalogForChain(chain);
  console.log(`  ${chain}: ${catalog.length} catalog rows`);

  for (const c of catalog) {
    const catalogName = String(c.name || "").trim();
    if (!catalogName) continue;

    const beforeList = dealExact.get(`${chain}\0${catalogName}`) || [];
    const before = beforeList[0] || null;

    const key = normalizeDealNameKey(catalogName);
    const afterList = key ? dealNorm.get(`${chain}\0${key}`) || [] : [];
    const after = afterList[0] || null;

    if (!before && !after) continue; // nije par — nema smisla za ovaj test

    const id = `${chain}\0${catalogName}`;
    if (seenLookup.has(id)) continue;
    seenLookup.add(id);

    const afterAmbiguous = afterList.length > 1;
    const afterNames = afterList.slice(0, 5).map((d) => d.name);

    lookups.push({
      chain,
      catalogName,
      catalogBrand: c.brand || null,
      catalogBarcode: c.barcode || null,
      catalogPrice: c.price,
      beforeHit: Boolean(before),
      afterHit: Boolean(after),
      beforeDealName: before?.name || null,
      afterDealName: after?.name || null,
      afterDealPrice: after?.price ?? null,
      afterDealOriginal: after?.original_price ?? null,
      afterStripped: after ? stripDealNameSuffix(after.name) : null,
      afterHasSuffix: after ? hasFlyerSuffix(after.name) : false,
      afterAmbiguous,
      afterMatchCount: afterList.length,
      afterNames,
      caseOnlyDiff:
        Boolean(after) &&
        stripDealNameSuffix(after.name) !== catalogName &&
        stripDealNameSuffix(after.name).toLowerCase() ===
          catalogName.toLowerCase(),
      exactStripDiffersFromCatalog:
        Boolean(after) &&
        stripDealNameSuffix(after.name).toLowerCase().replace(/\s+/g, " ") ===
          catalogName.toLowerCase().replace(/\s+/g, " "),
    });
  }
}

const sample = sampleStable(lookups, Math.min(SAMPLE, lookups.length), 42);

let beforeHit = 0;
let afterHit = 0;
let bothHit = 0;
let newHit = 0;
let lostHit = 0;
const newHits = [];

for (const p of sample) {
  if (p.beforeHit) beforeHit++;
  if (p.afterHit) afterHit++;
  if (p.beforeHit && p.afterHit) bothHit++;
  if (!p.beforeHit && p.afterHit) {
    newHit++;
    newHits.push(p);
  }
  if (p.beforeHit && !p.afterHit) lostHit++;
}

const allNew = lookups.filter((p) => !p.beforeHit && p.afterHit);
const ambiguousNew = allNew.filter((p) => p.afterAmbiguous);
const review = sampleStable(allNew, Math.min(REVIEW, allNew.length), 7);

const summary = {
  pairUniverseLookups: lookups.length,
  sampleSize: sample.length,
  beforeHit,
  afterHit,
  bothHit,
  newHit,
  lostHit,
  beforePct: sample.length
    ? Math.round((1000 * beforeHit) / sample.length) / 10
    : 0,
  afterPct: sample.length
    ? Math.round((1000 * afterHit) / sample.length) / 10
    : 0,
  universeBefore: lookups.filter((p) => p.beforeHit).length,
  universeAfter: lookups.filter((p) => p.afterHit).length,
  universeNew: allNew.length,
  universeBoth: lookups.filter((p) => p.beforeHit && p.afterHit).length,
  universeLost: lookups.filter((p) => p.beforeHit && !p.afterHit).length,
  ambiguousAfterInNew: ambiguousNew.length,
  caseOnlyDiffInNew: allNew.filter((p) => p.caseOnlyDiff).length,
};

console.log("\n=== SUMMARY ===");
console.log(JSON.stringify(summary, null, 2));

console.log(`\n=== REVIEW (${review.length}/${allNew.length} new hits) ===`);
for (let i = 0; i < review.length; i++) {
  const h = review[i];
  console.log(
    `\n#${i + 1} [${h.chain}] caseOnly=${h.caseOnlyDiff} ambiguous=${h.afterAmbiguous} (n=${h.afterMatchCount})`
  );
  console.log(`  catalog: ${h.catalogName}`);
  console.log(`  deal:    ${h.afterDealName}`);
  console.log(`  strip:   ${h.afterStripped}`);
  console.log(
    `  prices:  cat=${h.catalogPrice} deal=${h.afterDealPrice} orig=${h.afterDealOriginal} bc=${h.catalogBarcode || "-"}`
  );
  if (h.afterAmbiguous) {
    console.log(`  other deals: ${h.afterNames.slice(1).join(" | ")}`);
  }
}

const outPath = resolve(root, "_tmp_sale_suffix_measure.json");
writeFileSync(
  outPath,
  JSON.stringify(
    {
      summary,
      review,
      allNew,
      ambiguousNew,
      allLookups: lookups,
    },
    null,
    2
  ),
  "utf8"
);
console.log(`\nWrote ${outPath}`);
