/**
 * strictBarcode: short-circuit samo za Božićnu košaricu; obični tok = master.
 * Pokreni: node scripts/test-christmas-cart-barcode.mjs
 */
import assert from "node:assert/strict";
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { holidayListToCartItems, getHolidayCartById } from "../src/lib/holidayCarts.js";

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

const { analyzeChainCart } = await import("../src/lib/cartCompare.js");
const { enrichItemsWithBarcodes } = await import("../src/lib/resolveCartBarcode.js");
const cartDraftSrc = readFileSync(resolve(__dir, "../src/lib/cartDraft.js"), "utf8");
const compareSrc = readFileSync(resolve(__dir, "../src/lib/cartCompare.js"), "utf8");
const cartPageSrc = readFileSync(resolve(__dir, "../src/pages/CartPage.jsx"), "utf8");

function foundLabel(found, total, { barcodeCart = false, chainLabel = "" } = {}) {
  if (!total) return null;
  if (found >= total) return `Pronađeno ${total} od ${total} · kompletna košarica`;
  if (found === 0 && barcodeCart && chainLabel) {
    return `${chainLabel} ne vodi ove artikle u našoj bazi`;
  }
  if (found === 0) return `Pronađeno 0 od ${total} · nema pogodaka`;
  return `Pronađeno ${found} od ${total} · djelomična usporedba`;
}

function isBarcodeCart(items) {
  if (!Array.isArray(items) || !items.length) return false;
  return items.every((it) => it?.strictBarcode === true);
}

// --- (c) UI poruka ---
assert.equal(
  foundLabel(0, 7, { barcodeCart: true, chainLabel: "Eurospin" }),
  "Eurospin ne vodi ove artikle u našoj bazi"
);
assert.equal(foundLabel(0, 7, { barcodeCart: false }), "Pronađeno 0 od 7 · nema pogodaka");
assert.equal(isBarcodeCart([{ barcode: "80176800" }]), false);
assert.equal(isBarcodeCart([{ barcode: "80176800", strictBarcode: true }]), true);
assert.equal(
  isBarcodeCart([
    { barcode: "80176800", strictBarcode: true },
    { barcode: "3850120700079" },
  ]),
  false,
  "miješana košarica nije strict"
);

// Source: short-circuit gated; isBarcodeCart uses strictBarcode
assert.match(compareSrc, /item\.strictBarcode === true/);
assert.match(cartPageSrc, /it\?\.strictBarcode === true/);
assert.match(cartDraftSrc, /strictBarcode === true/);

const list = getHolidayCartById("bozicna-kosarica");
const strictItems = holidayListToCartItems(list);
assert.ok(strictItems.every((i) => i.strictBarcode === true && i.barcode));

// Draft roundtrip: JSON → parse zadržava strictBarcode (isto što radi loadCartDraft)
const roundtrip = JSON.parse(JSON.stringify({ items: strictItems }));
assert.ok(roundtrip.items.every((i) => i.strictBarcode === true));

// enrichItemsWithBarcodes ne briše strictBarcode ni postojeći barkod
const enrichedStrict = await enrichItemsWithBarcodes(strictItems, "Lidl");
assert.ok(enrichedStrict.every((i) => i.strictBarcode === true));
assert.deepEqual(
  enrichedStrict.map((i) => i.barcode),
  strictItems.map((i) => i.barcode)
);

// --- (b) strictBarcode bez EAN-a u lancu → no_barcode ---
const analysisStrict = await analyzeChainCart("Lidl", strictItems);
const euro = analysisStrict.others.find((r) => r.chain === "Eurospin");
assert.equal(euro.found, 0);
for (const line of euro.lines) {
  assert.equal(line.unavailableReason, "no_barcode");
  assert.equal(line.matchedBy, null);
}
const dm = analysisStrict.others.find((r) => r.chain === "Dm");
assert.equal(dm.found, 0);
assert.ok(dm.lines.every((l) => l.unavailableReason === "no_barcode"));

// --- (a) obična stavka s barkodom (bez strict): Eurospin nema EAN, ali type_unit radi ---
const ordinary = {
  id: "ord-1",
  name: "Dukat Trajno mlijeko 2,8%, 1l-boca",
  barcode: "3850354006053", // u 7 lanaca, NE u Eurospinu
  // nema strictBarcode
};
const analysisOrdinary = await analyzeChainCart("Lidl", [ordinary]);
const euroOrd = analysisOrdinary.others.find((r) => r.chain === "Eurospin");
assert.ok(euroOrd);
const euroLine = euroOrd.lines[0];
assert.equal(euroLine.available, true, "običan tok mora naći sličan tip");
assert.equal(euroLine.matchedBy, "type_unit");
assert.notEqual(euroLine.unavailableReason, "no_barcode");

// Isti ulaz sa strictBarcode → no_barcode (kontrast)
const strictTwin = { ...ordinary, id: "ord-strict", strictBarcode: true };
const analysisTwin = await analyzeChainCart("Eurospin", [strictTwin]);
assert.equal(analysisTwin.primary.lines[0].unavailableReason, "no_barcode");
assert.equal(analysisTwin.primary.lines[0].available, false);

// Dokaz master-like: bez strictBarcode, primary Eurospin = type_unit (ne no_barcode)
const analysisSame = await analyzeChainCart("Eurospin", [ordinary]);
const primaryEuro = analysisSame.primary.lines[0];
assert.equal(primaryEuro.available, true);
assert.equal(primaryEuro.matchedBy, "type_unit");
assert.notEqual(primaryEuro.unavailableReason, "no_barcode");

console.log("OK test-christmas-cart-barcode", {
  strictEuro: euro.found,
  ordinaryEuroMatchedBy: euroLine.matchedBy,
  ordinaryEuroName: (euroLine.name || "").slice(0, 40),
  strictTwinReason: analysisTwin.primary.lines[0].unavailableReason,
  primaryEuroMatchedBy: primaryEuro.matchedBy,
});
