/**
 * Live: barkod short-circuit (Eurospin) + found===0 poruka helper.
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

function foundLabel(found, total, { barcodeCart = false, chainLabel = "" } = {}) {
  if (!total) return null;
  if (found >= total) return `Pronađeno ${total} od ${total} · kompletna košarica`;
  if (found === 0 && barcodeCart && chainLabel) {
    return `${chainLabel} ne vodi ove artikle u našoj bazi`;
  }
  if (found === 0) return `Pronađeno 0 od ${total} · nema pogodaka`;
  return `Pronađeno ${found} od ${total} · djelomična usporedba`;
}

assert.equal(
  foundLabel(0, 7, { barcodeCart: true, chainLabel: "Eurospin" }),
  "Eurospin ne vodi ove artikle u našoj bazi"
);
assert.equal(
  foundLabel(0, 7, { barcodeCart: true, chainLabel: "Dm" }),
  "Dm ne vodi ove artikle u našoj bazi"
);
assert.equal(foundLabel(0, 7, { barcodeCart: false }), "Pronađeno 0 od 7 · nema pogodaka");

const list = getHolidayCartById("bozicna-kosarica");
assert.ok(list);
const items = holidayListToCartItems(list);
assert.ok(items.every((i) => i.barcode));

const analysis = await analyzeChainCart("Lidl", items);
assert.equal(analysis.primary?.chain, "Lidl");
assert.ok(analysis.primary?.found >= 5, `Lidl found=${analysis.primary?.found}`);

const withImg = (analysis.primary?.lines || []).filter((l) => l.available && l.imageUrl);
assert.ok(withImg.length >= 5, `slike na Lidl linijama: ${withImg.length}`);

const euro = (analysis.others || []).find((r) => r.chain === "Eurospin");
assert.ok(euro, "Eurospin u others");
assert.equal(euro.found, 0, "Eurospin found=0");
for (const line of euro.lines || []) {
  assert.equal(line.available, false);
  assert.equal(line.matchedBy, null);
  assert.equal(line.unavailableReason, "no_barcode");
}

const dm = (analysis.others || []).find((r) => r.chain === "Dm");
assert.ok(dm);
assert.equal(dm.found, 0, "Dm found=0");
for (const line of dm.lines || []) {
  assert.equal(line.available, false);
  assert.equal(line.matchedBy, null);
  assert.equal(line.unavailableReason, "no_barcode");
}

const raw = JSON.parse(
  readFileSync(resolve(__dir, "../src/data/holidayCarts.json"), "utf8")
);
assert.ok(raw[0].items.every((it) => !("imageUrl" in it) && !("image_url" in it)));

console.log("OK test-christmas-cart-barcode", {
  lidlFound: analysis.primary.found,
  lidlImages: withImg.length,
  eurospin: euro.found,
  dm: dm.found,
  n: items.length,
});
