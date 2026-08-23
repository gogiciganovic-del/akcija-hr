/**
 * Prije/poslije: tip-fallback odabir s ±25% pakiranjem prije €/kg.
 * Run: node scripts/measure-type-fallback-pack-size.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { matchProductType, getProductType, tokenizeNameForType } from "../src/lib/productTypes.js";
import { parseQuantityFromName, pricePerBaseUnit } from "../src/lib/quantityParse.js";
import {
  shouldSkipTypeFallbackCandidate,
  shouldSkipTypeFallbackQuery,
} from "../src/lib/typeFallbackFilters.js";

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

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const sb = createClient(url, key);

const TIGHT_MIN = 0.75;
const TIGHT_MAX = 1.25;

function isComboProduct(name) {
  return /\b2\s*u\s*1\b|\b2\s*in\s*1\b|\b2\s*&\s*1\b/i.test(String(name || ""));
}

function baseUnit(u) {
  if (u === "g" || u === "kg") return "kg";
  if (u === "ml" || u === "L") return "L";
  if (u === "kom") return "kom";
  return null;
}

function qtyBase(v, u) {
  if (!(v > 0)) return null;
  if (u === "g" || u === "ml") return v / 1000;
  if (u === "kg" || u === "L" || u === "kom") return v;
  return null;
}

function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function significantNameTokens(name, typeMeta) {
  const ban = new Set((typeMeta?.matches || []).map((x) => String(x).toUpperCase()));
  if (typeMeta?.key) ban.add(typeMeta.key.toUpperCase());
  if (typeMeta?.label) {
    for (const t of tokenizeNameForType(typeMeta.label)) ban.add(t);
  }
  for (const w of ["PET", "PACK", "PROMO", "XXL", "DUO", "SET", "MINI"]) ban.add(w);
  return tokenizeNameForType(name).filter((t) => t.length >= 3 && !ban.has(t));
}

function pickBest(cands, wantedCompare, mode) {
  const med = median(cands.map((c) => c.perUnit));
  const filtered =
    med != null && med > 0
      ? cands.filter((c) => c.perUnit >= med / 5 && c.perUnit <= 5 * med)
      : cands;
  const pool = filtered.length ? filtered : cands;

  let pickFrom = pool;
  if (mode === "new" && wantedCompare != null) {
    const tight = pool.filter(
      (c) =>
        c.packCompare != null &&
        c.packCompare >= wantedCompare * TIGHT_MIN &&
        c.packCompare <= wantedCompare * TIGHT_MAX
    );
    if (tight.length) pickFrom = tight;
  }

  pickFrom.sort((a, b) => a.perUnit - b.perUnit);
  return {
    best: pickFrom[0] || null,
    poolSize: pool.length,
    tightSize:
      mode === "new" && wantedCompare != null
        ? pool.filter(
            (c) =>
              c.packCompare != null &&
              c.packCompare >= wantedCompare * TIGHT_MIN &&
              c.packCompare <= wantedCompare * TIGHT_MAX
          ).length
        : null,
    usedTight: mode === "new" && pickFrom !== pool,
  };
}

async function resolveFallback(cartName, chain, mode) {
  if (isComboProduct(cartName)) return { ok: false, reason: "no_similar" };
  const typeKey = matchProductType(cartName);
  const qty = parseQuantityFromName(cartName);
  const typeMeta = getProductType(typeKey);
  if (!typeKey || !qty || !typeMeta || !baseUnit(qty.unit)) {
    return { ok: false, reason: "cannot_compare" };
  }
  if (shouldSkipTypeFallbackQuery(cartName)) {
    return { ok: false, reason: "no_similar" };
  }
  const wantedBase = baseUnit(qty.unit);
  const wantedQty = qtyBase(qty.value, qty.unit);
  const wantedUnitSize = qty.unitValue != null ? qtyBase(qty.unitValue, qty.unit) : null;
  const wantedCompare = wantedUnitSize ?? wantedQty;
  if (wantedQty == null) return { ok: false, reason: "cannot_compare" };
  const qSig = significantNameTokens(cartName, typeMeta);
  const needShared = !typeKey.includes("_");

  const { data, error } = await sb
    .from("regular_prices")
    .select("name, price, special_price, quantity_value, quantity_unit, product_type")
    .eq("chain", chain)
    .eq("product_type", typeKey)
    .limit(100);
  if (error) return { ok: false, reason: error.message };

  const typedRows = (data || []).filter((row) => matchProductType(row.name) === typeKey);
  if (!typedRows.length) return { ok: false, reason: "not_in_catalog" };

  const cands = [];
  for (const row of typedRows) {
    if (isComboProduct(row.name)) continue;
    if (shouldSkipTypeFallbackCandidate(row.name, typeKey)) continue;
    if (needShared && qSig.length) {
      const cSig = new Set(significantNameTokens(row.name, typeMeta));
      if (!qSig.some((t) => cSig.has(t))) continue;
    }
    let qv = row.quantity_value != null ? Number(row.quantity_value) : null;
    let qu = row.quantity_unit || null;
    const parsed = parseQuantityFromName(row.name);
    let candUnitSize =
      parsed?.unitValue != null ? qtyBase(parsed.unitValue, parsed.unit) : null;
    if (qv == null || !qu) {
      if (!parsed) continue;
      qv = parsed.value;
      qu = parsed.unit;
    }
    if (baseUnit(qu) !== wantedBase) continue;
    const compareCand = candUnitSize ?? qtyBase(qv, qu);
    if (
      compareCand == null ||
      compareCand < wantedCompare * 0.5 ||
      compareCand > wantedCompare * 2
    )
      continue;
    const price = Number(row.special_price ?? row.price);
    if (!(price > 0)) continue;
    const per = pricePerBaseUnit(price, qv, qu);
    if (!per) continue;
    cands.push({
      name: row.name,
      perUnit: per.perUnit,
      packCompare: compareCand,
      parsedQty: parsed ? `${parsed.value}${parsed.unit}` : `${qv}${qu}`,
    });
  }
  if (!cands.length) return { ok: false, reason: "no_similar" };

  const { best, poolSize, tightSize, usedTight } = pickBest(cands, wantedCompare, mode);
  if (!best) return { ok: false, reason: "no_similar" };
  return {
    ok: true,
    name: best.name,
    perUnit: best.perUnit,
    packCompare: best.packCompare,
    parsedQty: best.parsedQty,
    poolSize,
    tightSize,
    usedTight,
    wantedCompare,
  };
}

const CASES = [
  { cart: "Gauda sir 160 g", chain: "Tommy" },
  { cart: "Grčki jogurt 400 g", chain: "Plodine" },
  { cart: "Grčki jogurt 400 g", chain: "Spar" },
  { cart: "Maslinovo ulje 1 L", chain: "Konzum" },
  { cart: "Jamnica Voda gazirana miner.6x1,5L PET", chain: "Konzum" },
  { cart: "Brašno oštro 1 kg", chain: "Konzum" },
  { cart: "Mljevena kava 500 g", chain: "Spar" },
  { cart: "Mljevena kava 500 g", chain: "Tommy" },
  { cart: "Mlijeko 2,8% 1 L", chain: "Konzum" },
  { cart: "Banana 1 kg", chain: "Lidl" },
  { cart: "Jaja M 10 kom", chain: "Spar" },
  { cart: "Maslac 250 g", chain: "Konzum" },
  { cart: "Piletina file 500 g", chain: "Konzum" },
  { cart: "Svinjetina mljevena 500 g", chain: "Konzum" },
  { cart: "Kruh bijeli 500 g", chain: "Spar" },
  { cart: "Riža dugo zrno 1 kg", chain: "Tommy" },
  { cart: "Tjestenina penne 500 g", chain: "Lidl" },
  { cart: "Šampon 400 ml", chain: "Dm" },
  { cart: "Toaletni papir 8 rola", chain: "Konzum" },
  { cart: "Omekšivač 2 L", chain: "Konzum" },
];

const changed = [];
let same = 0;
let onlyOld = 0;
let onlyNew = 0;

console.log("=== PRIJE/poslije tip-fallback (±25% pakiranje) ===\n");

for (const c of CASES) {
  const oldR = await resolveFallback(c.cart, c.chain, "old");
  const newR = await resolveFallback(c.cart, c.chain, "new");

  const oldName = oldR.ok ? oldR.name : `— (${oldR.reason})`;
  const newName = newR.ok ? newR.name : `— (${newR.reason})`;
  const diff = oldR.ok && newR.ok && oldR.name !== newR.name;

  if (diff) {
    changed.push({ ...c, oldR, newR });
    console.log(`* [${c.chain}] ${c.cart}`);
    console.log(`    PRIJE:  ${oldR.name}`);
    console.log(`            pack≈${oldR.packCompare?.toFixed(3)} wanted≈${oldR.wantedCompare?.toFixed(3)} €/${oldR.perUnit?.toFixed(2)}`);
    console.log(`    POSLIJE: ${newR.name}`);
    console.log(
      `            pack≈${newR.packCompare?.toFixed(3)} wanted≈${newR.wantedCompare?.toFixed(3)} €/${newR.perUnit?.toFixed(2)} tight=${newR.tightSize} usedTight=${newR.usedTight}`
    );
    console.log("");
  } else {
    same++;
    if (oldR.ok && !newR.ok) onlyOld++;
    if (!oldR.ok && newR.ok) onlyNew++;
  }
}

console.log(`\n=== SUMMARY ===`);
console.log(`Ukupno: ${CASES.length}`);
console.log(`Isti odabir: ${same}`);
console.log(`Promijenjen odabir: ${changed.length}`);
console.log(`Samo prije imao match: ${onlyOld}`);
console.log(`Samo poslije imao match: ${onlyNew}`);

if (changed.length) {
  console.log(`\n=== PROMJENE (${changed.length}) ===`);
  for (const ch of changed) {
    console.log(
      `- [${ch.chain}] ${ch.cart}\n  → ${ch.oldR.name}\n  → ${ch.newR.name} (tight pool ${ch.newR.tightSize}, usedTight=${ch.newR.usedTight})`
    );
  }
}
