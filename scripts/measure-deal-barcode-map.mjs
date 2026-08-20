/**
 * Mjerenje: jednoznačan barkod iz regular_prices za active_deals
 * (normalizeDealNameKey = strip letak-sufiks + case/space).
 *
 * SAMO mjerenje — ne upisuje u DB, ne dira UI / cartCompare.
 *
 * Usage: node scripts/measure-deal-barcode-map.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { chainFromStoreName } from "../src/lib/constants.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const PAGE = 1000;
const REVIEW_CAP = Number(process.env.REVIEW_CAP || 40);
const MIN_BC = 8;

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

async function fetchAllDeals() {
  const rows = [];
  let from = 0;
  while (true) {
    const { data, error } = await sb
      .from("active_deals")
      .select("deal_id, name, store_name, price, original_price, barcode")
      .range(from, from + PAGE - 1);
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
const dealsRaw = await fetchAllDeals();

const deals = dealsRaw
  .map((d) => {
    const chain = chainFromStoreName(d.store_name);
    const key = normalizeDealNameKey(d.name);
    const existingBc = String(d.barcode || "").trim();
    return {
      dealId: d.deal_id,
      dealName: d.name,
      storeName: d.store_name,
      chain,
      key,
      stripped: stripDealNameSuffix(d.name),
      dealPrice: parsePrice(d.price),
      dealOriginal: parsePrice(d.original_price),
      dealBarcodeExisting: existingBc.length >= MIN_BC ? existingBc : null,
    };
  })
  .filter((d) => d.chain && d.key);

const dealChains = [...new Set(deals.map((d) => d.chain))].sort();
const alreadyHaveBarcode = deals.filter((d) => d.dealBarcodeExisting).length;

console.log(
  JSON.stringify(
    {
      dealsTotal: dealsRaw.length,
      dealsUsable: deals.length,
      alreadyHaveBarcode,
      dealChains,
    },
    null,
    2
  )
);

/** @type {Map<string, { name: string, barcode: string, price: number|null, brand: string|null }[]>} */
const catalogByChainKey = new Map();

console.log("Indexing regular_prices by chain + normalizeDealNameKey…");
for (const chain of dealChains) {
  const catalog = await fetchCatalogForChain(chain);
  console.log(`  ${chain}: ${catalog.length} rows`);
  for (const r of catalog) {
    const name = String(r.name || "").trim();
    const bc = String(r.barcode || "").trim();
    if (!name || bc.length < MIN_BC) continue;
    const key = normalizeDealNameKey(name);
    if (!key) continue;
    const mapKey = `${chain}\0${key}`;
    if (!catalogByChainKey.has(mapKey)) catalogByChainKey.set(mapKey, []);
    catalogByChainKey.get(mapKey).push({
      name,
      barcode: bc,
      price: parsePrice(r.price),
      brand: r.brand || null,
    });
  }
}

/** @type {object[]} */
const unique = [];
/** @type {object[]} */
const none = [];
/** @type {object[]} */
const ambiguous = [];

for (const d of deals) {
  const rows = catalogByChainKey.get(`${d.chain}\0${d.key}`) || [];
  const byCode = new Map();
  for (const r of rows) {
    if (!byCode.has(r.barcode)) byCode.set(r.barcode, r);
  }
  const codes = [...byCode.keys()];

  if (codes.length === 0) {
    none.push(d);
    continue;
  }
  if (codes.length > 1) {
    ambiguous.push({
      ...d,
      barcodes: codes,
      catalogExamples: codes.slice(0, 4).map((c) => {
        const r = byCode.get(c);
        return {
          barcode: c,
          catalogName: r.name,
          catalogPrice: r.price,
          brand: r.brand,
        };
      }),
    });
    continue;
  }

  const cat = byCode.get(codes[0]);
  unique.push({
    chain: d.chain,
    dealId: d.dealId,
    dealName: d.dealName,
    dealStripped: d.stripped,
    dealPrice: d.dealPrice,
    dealOriginal: d.dealOriginal,
    dealBarcodeExisting: d.dealBarcodeExisting,
    catalogName: cat.name,
    catalogBarcode: cat.barcode,
    catalogPrice: cat.price,
    catalogBrand: cat.brand,
    nameExactIgnoreCase:
      d.stripped.toLowerCase().replace(/\s+/g, " ") ===
      cat.name.toLowerCase().replace(/\s+/g, " "),
  });
}

const byChain = {};
for (const u of unique) {
  byChain[u.chain] = (byChain[u.chain] || 0) + 1;
}

const summary = {
  dealsUsable: deals.length,
  uniqueBarcodeCandidates: unique.length,
  noCatalogMatch: none.length,
  ambiguous: ambiguous.length,
  uniquePct: Math.round((1000 * unique.length) / deals.length) / 10,
  nonePct: Math.round((1000 * none.length) / deals.length) / 10,
  ambiguousPct: Math.round((1000 * ambiguous.length) / deals.length) / 10,
  alreadyHaveBarcodeOnDeal: alreadyHaveBarcode,
  uniqueByChain: byChain,
};

console.log("\n=== SUMMARY ===");
console.log(JSON.stringify(summary, null, 2));

const ambSample = sampleStable(ambiguous, Math.min(8, ambiguous.length), 3);
console.log(`\n=== AMBIGUOUS EXAMPLES (${ambSample.length}) ===`);
for (let i = 0; i < ambSample.length; i++) {
  const a = ambSample[i];
  console.log(`\n#A${i + 1} [${a.chain}] ${a.dealStripped}`);
  console.log(`  deal: ${a.dealName} @ ${a.dealPrice}`);
  for (const ex of a.catalogExamples) {
    console.log(
      `  bc ${ex.barcode} | ${ex.catalogName} | ${ex.catalogPrice} | ${ex.brand || "-"}`
    );
  }
}

const reviewAll = unique.length <= REVIEW_CAP;
const review = reviewAll
  ? [...unique].sort((a, b) =>
      a.chain === b.chain
        ? a.dealStripped.localeCompare(b.dealStripped, "hr")
        : a.chain.localeCompare(b.chain)
    )
  : sampleStable(unique, REVIEW_CAP, 7).sort((a, b) =>
      a.chain === b.chain
        ? a.dealStripped.localeCompare(b.dealStripped, "hr")
        : a.chain.localeCompare(b.chain)
    );

console.log(
  `\n=== REVIEW CANDIDATES (${review.length}${reviewAll ? " = ALL" : ` of ${unique.length}`}) ===`
);
for (let i = 0; i < review.length; i++) {
  const u = review[i];
  console.log(
    `\n#${i + 1} [${u.chain}] bc=${u.catalogBarcode}`
  );
  console.log(`  deal:    ${u.dealName}`);
  console.log(`  strip:   ${u.dealStripped}`);
  console.log(`  catalog: ${u.catalogName}`);
  console.log(
    `  prices:  deal=${u.dealPrice} (orig ${u.dealOriginal}) | cat=${u.catalogPrice}`
  );
}

const outPath = resolve(root, "_tmp_deal_barcode_map.json");
const mdPath = resolve(root, "_tmp_deal_barcode_map_review.md");

writeFileSync(
  outPath,
  JSON.stringify(
    {
      summary,
      review,
      allUnique: unique,
      ambiguousSample: ambSample,
      allAmbiguous: ambiguous,
    },
    null,
    2
  ),
  "utf8"
);

const mdLines = [
  `# Deal → barcode map (mjerenje only)`,
  ``,
  `- Unique candidates: **${unique.length}** / ${deals.length}`,
  `- No match: **${none.length}**`,
  `- Ambiguous: **${ambiguous.length}**`,
  `- Review list: **${review.length}**${reviewAll ? " (svi)" : ` (uzorak od ${unique.length})`}`,
  ``,
  `| # | Lanac | Deal (strip) | Katalog | Barkod | Deal € | Cat € |`,
  `|---|-------|--------------|---------|--------|--------|-------|`,
];
for (let i = 0; i < review.length; i++) {
  const u = review[i];
  const esc = (s) => String(s || "").replace(/\|/g, "\\|");
  mdLines.push(
    `| ${i + 1} | ${u.chain} | ${esc(u.dealStripped)} | ${esc(u.catalogName)} | \`${u.catalogBarcode}\` | ${u.dealPrice ?? "-"} | ${u.catalogPrice ?? "-"} |`
  );
}
if (ambSample.length) {
  mdLines.push(``, `## Ambiguous examples`, ``);
  for (const a of ambSample) {
    mdLines.push(`### ${a.chain}: ${a.dealStripped}`);
    for (const ex of a.catalogExamples) {
      mdLines.push(
        `- \`${ex.barcode}\` — ${ex.catalogName} (${ex.catalogPrice ?? "-"} €)`
      );
    }
    mdLines.push(``);
  }
}
writeFileSync(mdPath, mdLines.join("\n"), "utf8");

console.log(`\nWrote ${outPath}`);
console.log(`Wrote ${mdPath}`);
