/**
 * Božićna košarica: struktura + barkod loader + UI/copy hooks.
 * Pokreni: npm run test:holiday-carts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getHolidayCarts, getHolidayCartById, holidayListToCartItems } from "../src/lib/holidayCarts.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(
  readFileSync(resolve(__dir, "../src/data/holidayCarts.json"), "utf8")
);

assert.equal(raw.length, 1, "točno 1 popis");
assert.equal(raw[0].id, "bozicna-kosarica");
assert.equal(raw[0].title, "Božićna košarica");
assert.ok(raw[0].items.length >= 5 && raw[0].items.length <= 10);

for (const it of raw[0].items) {
  assert.ok(String(it.barcode || "").trim().length >= 8, `barkod: ${it.displayName}`);
  assert.ok(String(it.displayName || "").trim(), "displayName obavezan");
  assert.equal(it.imageUrl, undefined, "URL slike ne ide u JSON");
}

const lists = getHolidayCarts();
assert.equal(lists.length, 1);
assert.equal(getHolidayCartById("bozicna-kosarica")?.title, "Božićna košarica");
assert.equal(getHolidayCartById("blagdansko-pecenje"), null);
assert.equal(getHolidayCartById("osnovno-kuhanje"), null);

const items = holidayListToCartItems(raw[0]);
assert.equal(items.length, raw[0].items.length);
assert.ok(items.every((i) => i.name && i.id && i.barcode));
assert.ok(items.every((i) => String(i.barcode).trim().length >= 8));
assert.equal(new Set(items.map((i) => i.id)).size, items.length, "jedinstveni id-evi");
assert.equal(items[0].name, raw[0].items[0].displayName);

const cartSrc = readFileSync(resolve(__dir, "../src/pages/CartPage.jsx"), "utf8");
assert.match(cartSrc, /getHolidayCarts/);
assert.match(cartSrc, /trackBlagdanskaListaPrikazana/);
assert.match(cartSrc, /trackBlagdanskaListaDodana/);
assert.match(cartSrc, /holidayListToCartItems/);
assert.match(cartSrc, /Isti proizvodi \(isti barkod\)/);
assert.match(cartSrc, /ne vodi ove artikle u našoj bazi/);
assert.match(cartSrc, /fromHolidayList/);
assert.match(cartSrc, /setFromHolidayList\(true\)/);
assert.match(cartSrc, /data-testid="holiday-compare-hint"/);
assert.match(cartSrc, /data-testid=\{`holiday-cart-\$\{list\.id\}`\}/);
assert.equal(raw[0].id, "bozicna-kosarica");

const compareSrc = readFileSync(resolve(__dir, "../src/lib/cartCompare.js"), "utf8");
assert.match(compareSrc, /unavailableReason: 'no_barcode'/);
assert.match(compareSrc, /attachProductImagesByBarcode/);

const eventsSrc = readFileSync(resolve(__dir, "../src/lib/usageEvents.js"), "utf8");
assert.match(eventsSrc, /blagdanska_lista_prikazana/);
assert.match(eventsSrc, /blagdanska_lista_dodana/);

console.log("OK test-holiday-carts");
