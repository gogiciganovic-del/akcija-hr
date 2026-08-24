/**
 * Koliko često requiresSharedSignificantWord eliminira SVE kandidate (0-of-N)
 * pri tip-fallbacku, po typeKey — na origin retcima s ispravnim product_type/qty.
 * Run: node scripts/measure-shared-word-blackout.mjs
 */
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(resolve(__dir, "node-resolve-js.mjs")));

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { parseQuantityFromName } from "../src/lib/quantityParse.js";
import {
  matchProductType,
  getProductType,
  tokenizeNameForType,
} from "../src/lib/productTypes.js";
import { shouldSkipTypeFallbackCandidate } from "../src/lib/typeFallbackFilters.js";
import {
  tokenizeSearchName,
  scoreSearchRelevance,
  RELEVANCE,
} from "../src/lib/searchRelevance.js";

const root = resolve(__dir, "..");

function loadEnv() {
  for (const line of readFileSync(resolve(root, ".env"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    process.env[m[1].trim().replace(/^\uFEFF/, "")] = m[2].trim().replace(/^"|"$/g, "");
  }
}
loadEnv();

const CHAINS_8 = [
  "Lidl",
  "Kaufland",
  "Konzum",
  "Spar",
  "Plodine",
  "Eurospin",
  "Tommy",
  "Studenac",
];

const PRODUCTS = [
  { label: "Kruh bijeli 500g" },
  { label: "Kruh polubijeli 500g" },
  { label: "Kruh crni/integralni 500g" },
  { label: "Peciva/kifle" },
  { label: "Mlijeko trajno 2,8% 1L" },
  { label: "Mlijeko svježe 1L" },
  { label: "Jogurt prirodni 180g" },
  { label: "Jogurt voćni" },
  { label: "Vrhnje za kuhanje 200ml" },
  { label: "Maslac 250g" },
  { label: "Sir gouda/edamac" },
  { label: "Jaja M 10kom" },
  { label: "Jaja L 10kom" },
  { label: "Piletina file 1kg" },
  { label: "Pileći batak" },
  { label: "Svinjetina mljevena" },
  { label: "Junetina mljevena" },
  { label: "Šunka narezak" },
  { label: "Hrenovke" },
  { label: "Brašno glatko 1kg" },
  { label: "Šećer kristal 1kg" },
  { label: "Ulje suncokretovo 1L" },
  { label: "Riža 1kg" },
  { label: "Tjestenina 500g" },
  { label: "Kava mljevena 200g" },
  { label: "Čaj" },
  { label: "Voda negazirana 1,5L" },
  { label: "Sok/napitak" },
  { label: "Banane 1kg" },
  { label: "Jabuke 1kg" },
  { label: "Krumpir 1kg" },
  { label: "Luk 1kg" },
  { label: "Rajčica" },
  { label: "Čokolada" },
  { label: "Keksi" },
  { label: "Deterdžent za rublje" },
  { label: "Toaletni papir 8/16 rola" },
  { label: "Sredstvo za suđe" },
];

const SKIP_TOKENS = new Set([
  "G", "KG", "ML", "L", "KOM", "ROLA", "ROL", "ROLO", "TRAJNO", "SVJEZE", "SVJEŽE",
  "PRIRODNI", "VOCNI", "VOĆNI", "NGAZIRANA", "GAZIRANA", "MLJEVENA", "KRISTAL",
  "GLATKO", "NAREZAK", "ZA", "KUHANJE", "RUBLJE", "SUĐE", "SUDJE",
]);

const sb = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

function isComboProduct(name) {
  return /\b2\s*u\s*1\b|\b2\s*in\s*1\b|\b2\s*&\s*1\b/i.test(String(name || ""));
}

function significantNameTokens(name, typeMeta) {
  const typeTokens = new Set((typeMeta?.matches || []).map((m) => String(m).toUpperCase()));
  if (typeMeta?.key) typeTokens.add(String(typeMeta.key).toUpperCase());
  if (typeMeta?.label) {
    for (const t of tokenizeNameForType(typeMeta.label)) typeTokens.add(t);
  }
  for (const w of ["PET", "PACK", "PROMO", "XXL", "DUO", "SET", "MINI"]) typeTokens.add(w);
  return tokenizeNameForType(name).filter((t) => t.length >= 3 && !typeTokens.has(t));
}

function sharesSignificantWord(queryTokens, candidateName, typeMeta) {
  if (!queryTokens.length) return true;
  const cand = new Set(significantNameTokens(candidateName, typeMeta));
  return queryTokens.some((t) => cand.has(t));
}

const SHARED_WORD_EXEMPT_TYPES = new Set([
  "jaja", "krumpir", "luk", "secer", "papir", "keks", "maslac", "tjestenina", "sir", "mlijeko",
]);

function requiresSharedSignificantWord(typeKey) {
  const key = String(typeKey || "");
  if (key.includes("_")) return false;
  if (SHARED_WORD_EXEMPT_TYPES.has(key)) return false;
  return true;
}

function originHasValidTypeQty(row, name) {
  if (!row?.product_type) return false;
  const typeKey = matchProductType(name);
  if (!typeKey || typeKey !== row.product_type) return false;
  const parsed = parseQuantityFromName(name);
  if (!parsed) return false;
  const qv = row.quantity_value != null ? Number(row.quantity_value) : null;
  const qu = row.quantity_unit || null;
  if (qv != null && qu && Number.isFinite(qv) && qv > 0) return true;
  return !!(parsed.value && parsed.unit);
}

// --- findClosestRegularPrice (kopija iz measure-common-products) ---
function escapeIlike(s) {
  return String(s || "").replace(/[%_,]/g, "");
}
function labelQueries(label) {
  const out = new Set();
  for (const part of label.split("/")) {
    const p = part.trim();
    if (p) out.add(p);
    const stripped = p
      .replace(/\d+[\s,]*(?:g|kg|ml|l|kom|rola?)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();
    if (stripped.length >= 2) out.add(stripped);
  }
  return [...out];
}
function meaningfulTokens(text) {
  return tokenizeSearchName(text).filter(
    (t) => t.length >= 3 && !SKIP_TOKENS.has(t) && !/^\d+$/.test(t)
  );
}
function pickNeedles(label) {
  const tokens = meaningfulTokens(label);
  const sorted = [...tokens].sort((a, b) => b.length - a.length);
  const needles = sorted.slice(0, 3);
  if (!needles.length) {
    const q = labelQueries(label)[0] || label;
    const n = escapeIlike(q.slice(0, 12));
    if (n.length >= 2) needles.push(n);
  }
  return [...new Set(needles.map(escapeIlike).filter((n) => n.length >= 2))];
}
function rowMatchesLabelIntent(label, rowName) {
  const n = rowName.toUpperCase();
  const l = label.toUpperCase();
  const rules = [
    [/PILET|PILEĆ/, /PILET|PILEĆ/], [/SVINJ/, /SVINJ/], [/JUNET|GOVED/, /JUNET|GOVED/],
    [/KRUH/, /KRUH/], [/MLIJEK/, /MLIJEK/], [/JOGURT/, /JOGURT/], [/MASLAC/, /MASLAC/],
    [/JAJ/, /JAJ/], [/BRAŠNO|BRASNO/, /BRAŠNO|BRASNO/], [/RIŽ|RIZ/, /RIŽ|RIZ/],
    [/TJEST/, /TJEST/], [/KAV/, /KAV/], [/VOD/, /VOD/], [/BANAN/, /BANAN/],
    [/JABUK/, /JABUK/], [/KRUMPIR/, /KRUMPIR/], [/RAJČ|RAJC/, /RAJČ|RAJC|TOMAT/],
    [/ČOKOLAD|COKOLAD/, /ČOKOLAD|COKOLAD/], [/KEKS/, /KEKS/], [/DETERD/, /DETERD/],
    [/TOALET/, /TOALET|PAPIR/], [/SUĐ|SUD/, /SUĐ|SUD/], [/HREN/, /HREN/],
    [/ŠUNK|SUNK/, /ŠUNK|SUNK/], [/SIR|GAUDA|EDAM/, /SIR|GAUDA|EDAM/],
    [/ULJE/, /ULJE/], [/ŠEĆER|SECER/, /ŠEĆER|SECER/], [/ČAJ|CAJ/, /ČAJ|CAJ/],
    [/SOK|NAPIT/, /SOK|NAPIT|NAP/], [/PECIV|KIFL/, /PECIV|KIFL|KROAS|ROG/], [/VRHN/, /VRHN/],
  ];
  for (const [labelRe, rowRe] of rules) {
    if (labelRe.test(l) && !rowRe.test(n)) return false;
  }
  return true;
}
function qtyDistance(label, row) {
  const want = parseQuantityFromName(label);
  if (!want) return 0;
  let qv = row.quantity_value != null ? Number(row.quantity_value) : null;
  let qu = row.quantity_unit || null;
  const parsed = parseQuantityFromName(row.name);
  if ((qv == null || !qu) && parsed) {
    qv = parsed.value;
    qu = parsed.unit;
  }
  if (qv == null || !qu || want.unit !== qu) return 2;
  const ratio = qv / want.value;
  if (ratio >= 0.75 && ratio <= 1.25) return 0;
  if (ratio >= 0.5 && ratio <= 2) return 1;
  return 3;
}
function scoreOriginRow(row, label, queries) {
  let bestRel = RELEVANCE.NONE;
  let tokenHits = 0;
  for (const q of queries) {
    for (const tok of meaningfulTokens(q)) {
      const rel = scoreSearchRelevance(row.name, null, tok);
      if (rel < RELEVANCE.NONE) {
        tokenHits++;
        bestRel = Math.min(bestRel, rel);
      }
    }
  }
  if (tokenHits === 0) return Infinity;
  return bestRel * 10 - tokenHits * 3 + qtyDistance(label, row);
}
async function findClosestRegularPrice(label, chain) {
  const queries = labelQueries(label);
  const needles = pickNeedles(label);
  const seen = new Map();
  for (const needle of needles) {
    const { data, error } = await sb
      .from("regular_prices")
      .select("barcode, name, quantity_value, quantity_unit, chain, product_type")
      .eq("chain", chain)
      .ilike("name", `%${needle}%`)
      .limit(200);
    if (error) throw error;
    for (const row of data || []) {
      if (!seen.has(row.name)) seen.set(row.name, row);
    }
  }
  let best = null;
  let bestScore = Infinity;
  for (const row of seen.values()) {
    if (!rowMatchesLabelIntent(label, row.name)) continue;
    const score = scoreOriginRow(row, label, queries);
    if (score < bestScore) {
      bestScore = score;
      best = row;
    }
  }
  return best;
}

/** @type {Map<string, object[]>} */
const catalogCache = new Map();

async function fetchTypedRows(chain, typeKey) {
  const key = `${chain}\0${typeKey}`;
  if (catalogCache.has(key)) return catalogCache.get(key);
  const { data, error } = await sb
    .from("regular_prices")
    .select("name, product_type")
    .eq("chain", chain)
    .eq("product_type", typeKey)
    .limit(200);
  if (error) throw error;
  const typed = (data || []).filter((r) => matchProductType(r.name) === typeKey);
  catalogCache.set(key, typed);
  return typed;
}

function poolBeforeSharedWord(typedRows, queryName, typeKey) {
  return typedRows.filter((row) => {
    if (isComboProduct(row.name)) return false;
    if (shouldSkipTypeFallbackCandidate(row.name, typeKey, queryName)) return false;
    return true;
  });
}

function poolAfterSharedWord(before, querySig, typeMeta) {
  return before.filter((row) => sharesSignificantWord(querySig, row.name, typeMeta));
}

/** @type {Map<string, { blackout: number, eligible: number, examples: string[] }>} */
const byType = new Map();
/** @type {Map<string, { blackout: number, eligible: number }>} */
const subtypeSkipped = new Map();

let totalOriginsValid = 0;
let totalPairs = 0;
let totalBlackout = 0;
let totalEligible = 0;
let totalNoCatalog = 0;
let totalSubtype = 0;

for (const product of PRODUCTS) {
  for (const originChain of CHAINS_8) {
    const originRow = await findClosestRegularPrice(product.label, originChain);
    if (!originRow || !originHasValidTypeQty(originRow, originRow.name)) continue;

    totalOriginsValid++;
    const name = originRow.name;
    const typeKey = matchProductType(name);
    const typeMeta = getProductType(typeKey);
    if (!typeMeta) continue;

    const needShared = requiresSharedSignificantWord(typeKey);
    const querySig = significantNameTokens(name, typeMeta);

    for (const targetChain of CHAINS_8) {
      if (targetChain === originChain) continue;
      totalPairs++;

      const typedRows = await fetchTypedRows(targetChain, typeKey);
      if (!typedRows.length) {
        totalNoCatalog++;
        continue;
      }

      if (!needShared) {
        totalSubtype++;
        const s = subtypeSkipped.get(typeKey) || { blackout: 0, eligible: 0 };
        s.eligible++;
        subtypeSkipped.set(typeKey, s);
        continue;
      }

      const before = poolBeforeSharedWord(typedRows, name, typeKey);
      if (!before.length) continue;

      totalEligible++;
      const after = poolAfterSharedWord(before, querySig, typeMeta);
      const isBlackout = after.length === 0;

      const rec = byType.get(typeKey) || { blackout: 0, eligible: 0, examples: [] };
      rec.eligible++;
      if (isBlackout) {
        totalBlackout++;
        rec.blackout++;
        if (rec.examples.length < 3) {
          rec.examples.push(
            `${product.label} | ${originChain}→${targetChain} | "${name}" | sig=[${querySig.join(", ")}] | N=${before.length}`
          );
        }
      }
      byType.set(typeKey, rec);
    }
  }
}

const sorted = [...byType.entries()].sort((a, b) => b[1].blackout - a[1].blackout);

console.log("\n=== requiresSharedSignificantWord — potpuni 0-of-N blackout ===");
console.log(`Origin retci s ispravnim product_type/qty: ${totalOriginsValid}`);
console.log(`Cross-chain parovi (8×8 minus dijagonala): ${totalPairs}`);
console.log(`Parovi bez kataloga tipa u cilju: ${totalNoCatalog}`);
console.log(`Parovi s podtipom (shared-word ne vrijedi): ${totalSubtype}`);
console.log(`Parovi s N>0 prije shared-word filtera: ${totalEligible}`);
console.log(`Od toga potpuni blackout (0/N nakon shared-word): ${totalBlackout} (${((100 * totalBlackout) / totalEligible || 0).toFixed(1)}%)\n`);

console.log("Po typeKey (samo generički tipovi, sortirano po blackout broju):");
console.log("typeKey".padEnd(22) + "blackout".padStart(9) + "eligible".padStart(10) + "  rate");
console.log("-".repeat(55));
for (const [typeKey, rec] of sorted) {
  const rate = rec.eligible ? ((100 * rec.blackout) / rec.eligible).toFixed(0) + "%" : "—";
  console.log(
    typeKey.padEnd(22) +
      String(rec.blackout).padStart(9) +
      String(rec.eligible).padStart(10) +
      "  " +
      rate
  );
}

console.log("\nPrimjeri (do 3 po tipu):");
for (const [typeKey, rec] of sorted.filter(([, r]) => r.blackout > 0)) {
  console.log(`\n  ${typeKey}:`);
  for (const ex of rec.examples) console.log(`    ${ex}`);
}

if (subtypeSkipped.size) {
  console.log("\nPodtipovi (shared-word isključen, samo eligible parovi):");
  for (const [k, v] of [...subtypeSkipped.entries()].sort((a, b) => b[1].eligible - a[1].eligible)) {
    console.log(`  ${k}: ${v.eligible} parova`);
  }
}
