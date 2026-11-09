/**
 * productDateLabel: redovna / akcija / stale / null updated_at.
 * Pokreni: npm run test:price-trust
 */
import { productDateLabel } from "../src/lib/priceTrust.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const freshIso = new Date().toISOString();
const staleIso = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
const saleIso = "2026-11-01T12:00:00Z";

const regularFresh = productDateLabel({
  priceSource: "regular",
  scrapedAt: freshIso,
});
assert(
  regularFresh &&
    regularFresh.startsWith("Cijena iz cjenika od ") &&
    !regularFresh.includes("možda nije aktualna"),
  `regular fresh, got ${JSON.stringify(regularFresh)}`
);
assert(!/\d{4}/.test(regularFresh), `regular must omit year, got ${JSON.stringify(regularFresh)}`);

const regularStale = productDateLabel({
  priceSource: "regular",
  scrapedAt: staleIso,
});
assert(
  regularStale &&
    regularStale.startsWith("Cijena iz cjenika od ") &&
    regularStale.includes("možda nije aktualna"),
  `regular stale, got ${JSON.stringify(regularStale)}`
);

const sale = productDateLabel({
  priceSource: "sale",
  scrapedAt: saleIso,
});
assert(sale && sale.startsWith("Ažurirano"), `sale label, got ${JSON.stringify(sale)}`);
assert(!sale.includes("cjenika"), `sale must not use cjenik copy, got ${JSON.stringify(sale)}`);

const regularNull = productDateLabel({
  priceSource: "regular",
  scrapedAt: null,
});
assert(regularNull === null, `null updated_at → null, got ${JSON.stringify(regularNull)}`);

const saleNoDate = productDateLabel({
  priceSource: "sale",
  scrapedAt: null,
});
assert(saleNoDate === null, `sale null scrapedAt → null, got ${JSON.stringify(saleNoDate)}`);

console.log("OK price-trust productDateLabel");
