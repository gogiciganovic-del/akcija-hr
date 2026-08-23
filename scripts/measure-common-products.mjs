/**
 * Masovna provjera cartCompare matchinga na čestim proizvodima × lancima.
 * Run: node scripts/measure-common-products.mjs
 * Run: node scripts/measure-common-products.mjs --csv out.csv
 */
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(resolve(__dir, "node-resolve-js.mjs")));

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { parseQuantityFromName } from "../src/lib/quantityParse.js";
import {
  tokenizeSearchName,
  scoreSearchRelevance,
  RELEVANCE,
} from "../src/lib/searchRelevance.js";

const root = resolve(__dir, "..");

/** 8 lanaca s redovnim cijenama (bez Dm). */
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
  { id: "kruh-bijeli", label: "Kruh bijeli 500g" },
  { id: "kruh-polubijeli", label: "Kruh polubijeli 500g" },
  { id: "kruh-crni", label: "Kruh crni/integralni 500g" },
  { id: "peciva", label: "Peciva/kifle" },
  { id: "mlijeko-trajno", label: "Mlijeko trajno 2,8% 1L" },
  { id: "mlijeko-svjeze", label: "Mlijeko svježe 1L" },
  { id: "jogurt-prirodni", label: "Jogurt prirodni 180g" },
  { id: "jogurt-vocni", label: "Jogurt voćni" },
  { id: "vrhnje", label: "Vrhnje za kuhanje 200ml" },
  { id: "maslac", label: "Maslac 250g" },
  { id: "sir-gouda", label: "Sir gouda/edamac" },
  { id: "jaja-m", label: "Jaja M 10kom" },
  { id: "jaja-l", label: "Jaja L 10kom" },
  { id: "piletina-file", label: "Piletina file 1kg" },
  { id: "piletina-batak", label: "Pileći batak" },
  { id: "svinjetina-mljevena", label: "Svinjetina mljevena" },
  { id: "junetina-mljevena", label: "Junetina mljevena" },
  { id: "sunka", label: "Šunka narezak" },
  { id: "hrenovke", label: "Hrenovke" },
  { id: "brasno", label: "Brašno glatko 1kg" },
  { id: "secer", label: "Šećer kristal 1kg" },
  { id: "ulje-suncokret", label: "Ulje suncokretovo 1L" },
  { id: "riza", label: "Riža 1kg" },
  { id: "tjestenina", label: "Tjestenina 500g" },
  { id: "kava", label: "Kava mljevena 200g" },
  { id: "caj", label: "Čaj" },
  { id: "voda", label: "Voda negazirana 1,5L" },
  { id: "sok", label: "Sok/napitak" },
  { id: "banane", label: "Banane 1kg" },
  { id: "jabuke", label: "Jabuke 1kg" },
  { id: "krumpir", label: "Krumpir 1kg" },
  { id: "luk", label: "Luk 1kg" },
  { id: "rajčica", label: "Rajčica" },
  { id: "cokolada", label: "Čokolada" },
  { id: "keksi", label: "Keksi" },
  { id: "deterdzent", label: "Deterdžent za rublje" },
  { id: "toaletni-papir", label: "Toaletni papir 8/16 rola" },
  { id: "sredstvo-sudje", label: "Sredstvo za suđe" },
];

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

const { analyzeChainCart, unavailableReasonLabel } = await import("../src/lib/cartCompare.js");

const sb = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

const SKIP_TOKENS = new Set([
  "G",
  "KG",
  "ML",
  "L",
  "KOM",
  "ROLA",
  "ROL",
  "ROLO",
  "TRAJNO",
  "SVJEZE",
  "SVJEŽE",
  "PRIRODNI",
  "VOCNI",
  "VOĆNI",
  "NGAZIRANA",
  "GAZIRANA",
  "MLJEVENA",
  "KRISTAL",
  "GLATKO",
  "NAREZAK",
  "ZA",
  "KUHANJE",
  "RUBLJE",
  "SUĐE",
  "SUDJE",
]);

function escapeIlike(s) {
  return String(s || "").replace(/[%_,]/g, "");
}

/** Varijante pretrage iz opisa (npr. gouda/edamac, crni/integralni). */
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
    [/PILET|PILEĆ/, /PILET|PILEĆ/],
    [/SVINJ/, /SVINJ/],
    [/JUNET|GOVED/, /JUNET|GOVED/],
    [/KRUH/, /KRUH/],
    [/MLIJEK/, /MLIJEK/],
    [/JOGURT/, /JOGURT/],
    [/MASLAC/, /MASLAC/],
    [/JAJ/, /JAJ/],
    [/BRAŠNO|BRASNO/, /BRAŠNO|BRASNO/],
    [/RIŽ|RIZ/, /RIŽ|RIZ/],
    [/TJEST/, /TJEST/],
    [/KAV/, /KAV/],
    [/VOD/, /VOD/],
    [/BANAN/, /BANAN/],
    [/JABUK/, /JABUK/],
    [/KRUMPIR/, /KRUMPIR/],
    [/RAJČ|RAJC/, /RAJČ|RAJC|TOMAT/],
    [/ČOKOLAD|COKOLAD/, /ČOKOLAD|COKOLAD/],
    [/KEKS/, /KEKS/],
    [/DETERD/, /DETERD/],
    [/TOALET/, /TOALET|PAPIR/],
    [/SUĐ|SUD/, /SUĐ|SUD/],
    [/HREN/, /HREN/],
    [/ŠUNK|SUNK/, /ŠUNK|SUNK/],
    [/SIR|GAUDA|EDAM/, /SIR|GAUDA|EDAM/],
    [/ULJE/, /ULJE/],
    [/ŠEĆER|SECER/, /ŠEĆER|SECER/],
    [/ČAJ|CAJ/, /ČAJ|CAJ/],
    [/SOK|NAPIT/, /SOK|NAPIT|NAP/],
    [/PECIV|KIFL/, /PECIV|KIFL|KROAS|ROG/],
    [/VRHN/, /VRHN/],
  ];
  for (const [labelRe, rowRe] of rules) {
    if (labelRe.test(l) && !rowRe.test(n)) return false;
  }
  if (/FILE|FILET|PRSA/.test(l) && /PILET|PILEĆ/.test(l) && /TUNE|RIB|LOSOS|SARDIN/.test(n)) {
    return false;
  }
  if (/KRUH BIJEL/.test(l) && /POLUBIJEL|RAŽEN|INTEGRAL|CRNI|CRNI/.test(n) && !/BIJEL/.test(n)) {
    return false;
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

/**
 * Najbliži redak u regular_prices za opis proizvoda u lancu.
 * @returns {Promise<object|null>}
 */
async function findClosestRegularPrice(label, chain) {
  const queries = labelQueries(label);
  const needles = pickNeedles(label);
  const seen = new Map();

  for (const needle of needles) {
    const { data, error } = await sb
      .from("regular_prices")
      .select(
        "barcode, name, price, special_price, quantity_value, quantity_unit, chain, product_type"
      )
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

function formatPrice(n) {
  if (n == null || !Number.isFinite(n)) return "";
  return n.toFixed(2).replace(".", ",");
}

function matchTypeLabel(line) {
  if (!line?.available) {
    const reason = line?.unavailableReason || "no_similar";
    return `nedostupno (${unavailableReasonLabel(reason)})`;
  }
  const by = line.matchedBy || "?";
  if (by === "type_unit") return "tip-fallback";
  if (line.priceSource === "sale") return `${by} (akcija)`;
  return by;
}

function csvEscape(s) {
  const t = String(s ?? "");
  if (/[",\n\r]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

/** @type {Record<string, string>[]} */
const rows = [];
/** @type {{ product: string, chains: string[] }[]} */
const missingOrigin = [];

let done = 0;
const total = PRODUCTS.length * CHAINS_8.length;

for (const product of PRODUCTS) {
  const originsFound = [];

  for (const originChain of CHAINS_8) {
    done++;
    if (done % 10 === 0) {
      process.stderr.write(`\r[${done}/${total}] ${product.label} @ ${originChain}   `);
    }

    let originRow;
    try {
      originRow = await findClosestRegularPrice(product.label, originChain);
    } catch (err) {
      for (const targetChain of CHAINS_8) {
        rows.push({
          product: product.label,
          origin_chain: originChain,
          target_chain: targetChain,
          origin_name: "",
          origin_barcode: "",
          result_name: "",
          price: "",
          match_type: `greška: ${err.message}`,
          price_source: "",
        });
      }
      continue;
    }

    if (!originRow) {
      for (const targetChain of CHAINS_8) {
        rows.push({
          product: product.label,
          origin_chain: originChain,
          target_chain: targetChain,
          origin_name: "(nema u katalogu)",
          origin_barcode: "",
          result_name: "",
          price: "",
          match_type: "nema polazišta",
          price_source: "",
        });
      }
      continue;
    }

    originsFound.push(originChain);

    const item = {
      name: originRow.name,
      barcode: originRow.barcode || null,
    };

    let analysis;
    try {
      analysis = await analyzeChainCart(originChain, [item]);
    } catch (err) {
      for (const targetChain of CHAINS_8) {
        rows.push({
          product: product.label,
          origin_chain: originChain,
          target_chain: targetChain,
          origin_name: originRow.name,
          origin_barcode: originRow.barcode || "",
          result_name: "",
          price: "",
          match_type: `greška: ${err.message}`,
          price_source: "",
        });
      }
      continue;
    }

    const primaryLine = analysis.primary?.lines?.[0] || null;
    const othersByChain = new Map(
      (analysis.others || []).map((o) => [o.chain, o.lines?.[0] || null])
    );

    for (const targetChain of CHAINS_8) {
      const line =
        targetChain === originChain
          ? primaryLine
          : othersByChain.get(targetChain) || null;

      rows.push({
        product: product.label,
        origin_chain: originChain,
        target_chain: targetChain,
        origin_name: originRow.name,
        origin_barcode: originRow.barcode || "",
        result_name: line?.available ? line.name || "" : "",
        price: line?.available ? formatPrice(line.price) : "",
        match_type: line ? matchTypeLabel(line) : "nedostupno",
        price_source: line?.available ? line.priceSource || "" : "",
      });
    }
  }

  if (!originsFound.length) {
    missingOrigin.push({ product: product.label, chains: [] });
  }
}

process.stderr.write("\n");

// Sažetak
const available = rows.filter((r) => r.price && r.match_type !== "nema polazišta");
const byType = {};
for (const r of available) {
  const key = r.match_type.split(" ")[0];
  byType[key] = (byType[key] || 0) + 1;
}

const noOriginRows = rows.filter((r) => r.match_type === "nema polazišta");
const uniqueMissing = [...new Set(noOriginRows.map((r) => `${r.product}|${r.origin_chain}`))];

console.log("# Mjerenje: česti proizvodi × lancima\n");
console.log(`Proizvoda na popisu: ${PRODUCTS.length}`);
console.log(`Lanaca: ${CHAINS_8.join(", ")}`);
console.log(`Redova (proizvod × origin × target): ${rows.length}`);
console.log(`Pogodaka (s cijenom): ${available.length}`);
console.log(`Kombinacija bez polazišta u katalogu: ${uniqueMissing.length}`);
console.log("\n## Pogoci po tipu\n");
for (const [k, v] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
  console.log(`- ${k}: ${v}`);
}

if (uniqueMissing.length) {
  console.log("\n## Nema polazišnog artikla (proizvod × origin lanac)\n");
  for (const key of uniqueMissing.sort()) {
    const [product, chain] = key.split("|");
    console.log(`- ${product} @ ${chain}`);
  }
}

console.log("\n## Uzorak (prvih 40 redova)\n");
console.log(
  "| proizvod | origin | target | polazišni naziv | rezultat | cijena | tip |"
);
console.log("|----------|--------|--------|-----------------|----------|--------|-----|");
for (const r of rows.slice(0, 40)) {
  const on = (r.origin_name || "").slice(0, 40).replace(/\|/g, "/");
  const rn = (r.result_name || r.match_type).slice(0, 40).replace(/\|/g, "/");
  console.log(
    `| ${r.product} | ${r.origin_chain} | ${r.target_chain} | ${on} | ${rn} | ${r.price || "—"} | ${r.match_type} |`
  );
}

const csvArg = process.argv.indexOf("--csv");
const csvPath =
  csvArg >= 0 && process.argv[csvArg + 1]
    ? resolve(process.cwd(), process.argv[csvArg + 1])
    : resolve(root, "_tmp_common_products_measure.csv");

const header = [
  "product",
  "origin_chain",
  "target_chain",
  "origin_name",
  "origin_barcode",
  "result_name",
  "price",
  "match_type",
  "price_source",
];
const csvLines = [
  header.join(","),
  ...rows.map((r) => header.map((h) => csvEscape(r[h])).join(",")),
];
mkdirSync(dirname(csvPath), { recursive: true });
writeFileSync(csvPath, csvLines.join("\n"), "utf8");
console.log(`\nPuna CSV tablica: ${csvPath}`);
