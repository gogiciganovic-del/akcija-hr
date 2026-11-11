/**
 * Live matching: svaka blagdanska stavka × 9 lanaca (analyzeChainCart).
 * Pokreni: node scripts/probe-holiday-cart-match.mjs
 * Zahtijeva .env (VITE_SUPABASE_*).
 */
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { getHolidayCarts } from "../src/lib/holidayCarts.js";

const __dir = dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(resolve(__dir, "node-resolve-js.mjs")));
const root = resolve(__dir, "..");
for (const line of readFileSync(resolve(root, ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) {
    process.env[m[1].trim().replace(/^\uFEFF/, "")] = m[2]
      .trim()
      .replace(/^"|"$/g, "");
  }
}

const { analyzeChainCart, REGULAR_PRICE_CHAINS } = await import(
  "../src/lib/cartCompare.js"
);

const chains = REGULAR_PRICE_CHAINS;
const lists = getHolidayCarts();
const names = [];
for (const list of lists) {
  for (const it of list.items || []) {
    const n = String(it.name || "").trim();
    if (n && !names.includes(n)) names.push(n);
  }
}

/** @type {Map<string, Record<string, string>>} */
const table = new Map();
for (const name of names) {
  table.set(name, Object.fromEntries(chains.map((c) => [c, "none"])));
}

for (const chain of chains) {
  for (const name of names) {
    const analysis = await analyzeChainCart(chain, [
      { name, barcode: null, price: null },
    ]);
    const line = analysis?.primary?.lines?.[0];
    let matchedBy = "none";
    if (line?.available && line.matchedBy) {
      matchedBy = String(line.matchedBy);
    } else if (line?.matchedBy === "cart") {
      matchedBy = "cart";
    }
    table.get(name)[chain] = matchedBy;
  }
}

const pad = (s, n) => String(s).padEnd(n).slice(0, n);
const nameW = Math.max(18, ...names.map((n) => n.length)) + 1;
const colW = 10;

console.log("");
console.log(
  pad("stavka", nameW) + chains.map((c) => pad(c, colW)).join("")
);
console.log("-".repeat(nameW + chains.length * colW));

const weak = [];
for (const name of names) {
  const row = table.get(name);
  const cells = chains.map((c) => pad(row[c], colW));
  console.log(pad(name, nameW) + cells.join(""));
  const noneCount = chains.filter((c) => row[c] === "none").length;
  if (noneCount >= 7) {
    weak.push({ name, noneCount, hits: 9 - noneCount });
  }
}

console.log("");
if (weak.length) {
  console.log("SLABI POGOTCI (≥7 lanaca bez matcha):");
  for (const w of weak) {
    console.log(`  - ${w.name}: none u ${w.noneCount}/9 lanaca (pogodaka ${w.hits})`);
  }
} else {
  console.log("Nema stavki s ≥7 lanaca bez matcha.");
}
console.log("OK probe-holiday-cart-match");
