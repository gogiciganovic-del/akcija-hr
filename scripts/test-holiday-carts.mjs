/**
 * Struktura blagdanskih popisa + loader.
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

assert.equal(raw.length, 2, "točno 2 popisa");
assert.deepEqual(
  raw.map((c) => c.id),
  ["blagdansko-pecenje", "osnovno-kuhanje"]
);

const pecenje = raw.find((c) => c.id === "blagdansko-pecenje");
assert.equal(pecenje.title, "Blagdansko pečenje");
assert.deepEqual(
  pecenje.items.map((i) => i.name),
  [
    "brašno 1 kg",
    "šećer 1 kg",
    "maslac 250 g",
    "jaja 10 kom",
    "mlijeko 1 l",
    "ulje suncokretovo 1 l",
    "čokolada 100 g",
  ]
);

const kuhanje = raw.find((c) => c.id === "osnovno-kuhanje");
assert.equal(kuhanje.title, "Osnovno za kuhanje");
assert.deepEqual(
  kuhanje.items.map((i) => i.name),
  [
    "tjestenina 500 g",
    "krumpir 2 kg",
    "mlijeko 1 l",
    "jaja 10 kom",
    "ulje suncokretovo 1 l",
  ]
);

const forbidden = /pršut|prsut|\bsir\b|vino|pjenušac|pjenusac|kulen/i;
for (const list of raw) {
  for (const it of list.items) {
    assert.equal(forbidden.test(it.name), false, `zabranjena stavka: ${it.name}`);
  }
}

const lists = getHolidayCarts();
assert.equal(lists.length, 2);
assert.equal(getHolidayCartById("blagdansko-pecenje")?.title, "Blagdansko pečenje");
assert.equal(getHolidayCartById("nope"), null);

const items = holidayListToCartItems(pecenje);
assert.equal(items.length, 7);
assert.ok(items.every((i) => i.name && i.id && i.barcode === null));
assert.equal(new Set(items.map((i) => i.id)).size, 7, "jedinstveni id-evi");

const cartSrc = readFileSync(resolve(__dir, "../src/pages/CartPage.jsx"), "utf8");
assert.match(cartSrc, /getHolidayCarts/);
assert.match(cartSrc, /trackBlagdanskaListaPrikazana/);
assert.match(cartSrc, /trackBlagdanskaListaDodana/);
assert.match(cartSrc, /holidayListToCartItems/);
assert.match(cartSrc, /Usporedba po vrsti i veličini pakiranja/);
assert.match(cartSrc, /fromHolidayList/);
assert.match(cartSrc, /setFromHolidayList\(true\)/);
assert.match(cartSrc, /setFromHolidayList\(false\)/);
assert.match(cartSrc, /data-testid="holiday-compare-hint"/);

const eventsSrc = readFileSync(resolve(__dir, "../src/lib/usageEvents.js"), "utf8");
assert.match(eventsSrc, /blagdanska_lista_prikazana/);
assert.match(eventsSrc, /blagdanska_lista_dodana/);

console.log("OK test-holiday-carts");
