/**
 * topDiscounts logika + Home wire.
 * Pokreni: npm run test:top-discounts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BF_WINDOW_START,
  BF_WINDOW_END,
  TOP_DISCOUNT_MIN,
  TOP_DISCOUNT_MAX,
  TOP_DISCOUNT_MAX_ITEMS,
  TOP_DISCOUNT_MIN_ITEMS,
  TOP_DISCOUNT_MAX_SCRAPE_AGE_MS,
  isTopDiscountWindowOpen,
  shouldShowTopDiscountStrip,
  selectTopDiscounts,
  isDealNotExpired,
  isScrapedWithinDays,
} from "../src/lib/topDiscounts.js";

const __dir = dirname(fileURLToPath(import.meta.url));

assert.equal(TOP_DISCOUNT_MIN, 40);
assert.equal(TOP_DISCOUNT_MAX, 70);
assert.equal(TOP_DISCOUNT_MAX_ITEMS, 8);
assert.equal(TOP_DISCOUNT_MIN_ITEMS, 5);
assert.equal(TOP_DISCOUNT_MAX_SCRAPE_AGE_MS, 2 * 24 * 60 * 60 * 1000);
assert.equal(BF_WINDOW_START, "2026-11-20");
assert.equal(BF_WINDOW_END, "2026-11-30");

/** Fiksni "now" — filter ne smije ovisiti o satu uređaja. */
const NOW = new Date("2026-11-19T12:00:00.000Z");
const FRESH = "2026-11-18T12:00:00.000Z"; // 1 dan
const STALE = "2026-11-16T11:00:00.000Z"; // >2 dana
const EDGE_OK = "2026-11-17T12:00:00.000Z"; // točno 2 dana

function product(partial) {
  return {
    id: partial.id || "x",
    name: partial.name || "Test",
    chain: partial.chain || "Lidl",
    store: partial.store || partial.chain || "Lidl",
    discount: partial.discount ?? 45,
    image: partial.image ?? "https://cdn.example.com/p.jpg",
    validUntil: partial.validUntil ?? "2099-12-31T12:00:00.000Z",
    scrapedAt: partial.scrapedAt === undefined ? FRESH : partial.scrapedAt,
    ...partial,
  };
}

const future = "2099-01-01T12:00:00.000Z";
const past = "2020-01-01T12:00:00.000Z";

assert.equal(isDealNotExpired(product({ validUntil: future }), NOW), true);
assert.equal(isDealNotExpired(product({ validUntil: past }), NOW), false);
assert.equal(isDealNotExpired(product({ validUntil: null }), NOW), false);

assert.equal(isScrapedWithinDays(product({ scrapedAt: FRESH }), NOW), true);
assert.equal(isScrapedWithinDays(product({ scrapedAt: EDGE_OK }), NOW), true);
assert.equal(isScrapedWithinDays(product({ scrapedAt: STALE }), NOW), false);
assert.equal(isScrapedWithinDays(product({ scrapedAt: null }), NOW), false);
assert.equal(isScrapedWithinDays(product({ scrapedAt: "" }), NOW), false);
assert.equal(isScrapedWithinDays(product({ scrapedAt: "not-a-date" }), NOW), false);
assert.equal(
  isScrapedWithinDays({ scraped_at: FRESH }, NOW),
  true,
  "prihvaća scraped_at alias"
);

// Date window (Zagreb) — sidro UTC noon
assert.equal(isTopDiscountWindowOpen(new Date("2026-11-19T12:00:00+01:00")), false);
assert.equal(isTopDiscountWindowOpen(new Date("2026-11-20T12:00:00+01:00")), true);
assert.equal(isTopDiscountWindowOpen(new Date("2026-11-30T12:00:00+01:00")), true);
assert.equal(isTopDiscountWindowOpen(new Date("2026-12-01T12:00:00+01:00")), false);

// DEV ?bf=1 only when isDev
assert.equal(
  shouldShowTopDiscountStrip(new Date("2026-11-10T12:00:00+01:00"), {
    isDev: true,
    search: "?bf=1",
  }),
  true
);
assert.equal(
  shouldShowTopDiscountStrip(new Date("2026-11-10T12:00:00+01:00"), {
    isDev: false,
    search: "?bf=1",
  }),
  false
);
assert.equal(
  shouldShowTopDiscountStrip(new Date("2026-11-25T12:00:00+01:00"), {
    isDev: false,
    search: "",
  }),
  true
);

const chains = ["Lidl", "Kaufland", "Konzum", "Spar", "Plodine", "Eurospin", "Tommy", "Studenac", "Dm"];
const many = chains.map((c, i) =>
  product({
    id: `p${i}`,
    chain: c,
    discount: 70 - i,
    image: `https://cdn.example.com/${i}.jpg`,
    validUntil: future,
    scrapedAt: FRESH,
  })
);

// 40–70 band
const band = selectTopDiscounts(
  [
    product({ id: "low", chain: "Lidl", discount: 39, validUntil: future }),
    product({ id: "ok", chain: "Kaufland", discount: 40, validUntil: future }),
    product({ id: "hi", chain: "Konzum", discount: 70, validUntil: future }),
    product({ id: "over", chain: "Spar", discount: 71, validUntil: future }),
    ...many.slice(3, 7).map((p, i) => ({ ...p, id: `fill${i}`, discount: 50 + i })),
  ],
  { now: NOW }
);
assert.ok(band.every((p) => p.discount >= 40 && p.discount <= 70));
assert.equal(
  band.some((p) => p.id === "low" || p.id === "over"),
  false
);

// one per chain, highest discount wins
const dup = selectTopDiscounts(
  [
    product({ id: "a1", chain: "Lidl", discount: 42, validUntil: future }),
    product({ id: "a2", chain: "Lidl", discount: 55, validUntil: future }),
    product({ id: "b", chain: "Kaufland", discount: 50, validUntil: future }),
    product({ id: "c", chain: "Konzum", discount: 48, validUntil: future }),
    product({ id: "d", chain: "Spar", discount: 47, validUntil: future }),
    product({ id: "e", chain: "Plodine", discount: 46, validUntil: future }),
  ],
  { now: NOW }
);
assert.equal(dup.find((p) => p.chain === "Lidl")?.id, "a2");
assert.equal(dup.filter((p) => p.chain === "Lidl").length, 1);

// max 8
const eight = selectTopDiscounts(many, { now: NOW });
assert.equal(eight.length, 8);
assert.ok(eight[0].discount >= eight[1].discount);

// <5 → empty
const few = selectTopDiscounts(many.slice(0, 4), { now: NOW });
assert.deepEqual(few, []);

// no photo / expired skipped
const filteredOut = selectTopDiscounts(
  [
    product({ id: "nophoto", chain: "Lidl", discount: 50, image: "data:image/png;base64,xx" }),
    product({ id: "exp", chain: "Kaufland", discount: 50, validUntil: past }),
    ...many.slice(0, 5),
  ],
  { now: NOW }
);
assert.equal(filteredOut.some((p) => p.id === "nophoto" || p.id === "exp"), false);

// svježe (≤2 dana) ostaje
const freshKeep = selectTopDiscounts(
  [
    product({ id: "f1", chain: "Lidl", discount: 50, scrapedAt: FRESH }),
    product({ id: "f2", chain: "Kaufland", discount: 51, scrapedAt: EDGE_OK }),
    product({ id: "f3", chain: "Konzum", discount: 52, scrapedAt: FRESH }),
    product({ id: "f4", chain: "Spar", discount: 53, scrapedAt: FRESH }),
    product({ id: "f5", chain: "Plodine", discount: 54, scrapedAt: FRESH }),
  ],
  { now: NOW }
);
assert.equal(freshKeep.length, 5);
assert.ok(freshKeep.some((p) => p.id === "f2"));

// 3+ dana se izbacuje
const staleDrop = selectTopDiscounts(
  [
    product({ id: "old", chain: "Lidl", discount: 70, scrapedAt: STALE }),
    product({ id: "n1", chain: "Kaufland", discount: 50, scrapedAt: FRESH }),
    product({ id: "n2", chain: "Konzum", discount: 50, scrapedAt: FRESH }),
    product({ id: "n3", chain: "Spar", discount: 50, scrapedAt: FRESH }),
    product({ id: "n4", chain: "Plodine", discount: 50, scrapedAt: FRESH }),
    product({ id: "n5", chain: "Eurospin", discount: 50, scrapedAt: FRESH }),
  ],
  { now: NOW }
);
assert.equal(staleDrop.some((p) => p.id === "old"), false);
assert.equal(staleDrop.length, 5);

// bez scrapedAt / nevaljan → izbaciti
const noScraped = selectTopDiscounts(
  [
    product({ id: "missing", chain: "Lidl", discount: 70, scrapedAt: null }),
    product({ id: "empty", chain: "Tommy", discount: 69, scrapedAt: "" }),
    product({ id: "bad", chain: "Dm", discount: 68, scrapedAt: "bogus" }),
    product({ id: "n1", chain: "Kaufland", discount: 50, scrapedAt: FRESH }),
    product({ id: "n2", chain: "Konzum", discount: 50, scrapedAt: FRESH }),
    product({ id: "n3", chain: "Spar", discount: 50, scrapedAt: FRESH }),
    product({ id: "n4", chain: "Plodine", discount: 50, scrapedAt: FRESH }),
    product({ id: "n5", chain: "Eurospin", discount: 50, scrapedAt: FRESH }),
  ],
  { now: NOW }
);
assert.equal(
  noScraped.some((p) => p.id === "missing" || p.id === "empty" || p.id === "bad"),
  false
);
assert.equal(noScraped.length, 5);

// manje od 5 nakon freshness filtra → []
const afterFreshTooFew = selectTopDiscounts(
  [
    product({ id: "ok1", chain: "Lidl", discount: 50, scrapedAt: FRESH }),
    product({ id: "ok2", chain: "Kaufland", discount: 50, scrapedAt: FRESH }),
    product({ id: "ok3", chain: "Konzum", discount: 50, scrapedAt: FRESH }),
    product({ id: "ok4", chain: "Spar", discount: 50, scrapedAt: FRESH }),
    product({ id: "stale5", chain: "Plodine", discount: 50, scrapedAt: STALE }),
    product({ id: "stale6", chain: "Eurospin", discount: 50, scrapedAt: STALE }),
  ],
  { now: NOW }
);
assert.deepEqual(afterFreshTooFew, []);

const homeSrc = readFileSync(resolve(__dir, "../src/pages/HomePage.jsx"), "utf8");
assert.match(homeSrc, /selectTopDiscounts/);
assert.match(homeSrc, /shouldShowTopDiscountStrip/);
assert.match(homeSrc, /Najveći popusti ovaj tjedan/);
assert.match(homeSrc, /Iz trenutnih akcija u trgovinama/);
assert.match(homeSrc, /trackBfTrakaPrikazana/);
assert.match(homeSrc, /trackBfTrakaKlik/);
assert.doesNotMatch(homeSrc, /Crni petak/);
assert.doesNotMatch(homeSrc, /najniža cijena/i);
assert.doesNotMatch(homeSrc, /garancija uštede/i);
assert.doesNotMatch(homeSrc, /prema cijeni koju navodi trgovac/);

const eventsSrc = readFileSync(resolve(__dir, "../src/lib/usageEvents.js"), "utf8");
assert.match(eventsSrc, /bf_traka_prikazana/);
assert.match(eventsSrc, /bf_traka_klik/);

const libSrc = readFileSync(resolve(__dir, "../src/lib/topDiscounts.js"), "utf8");
assert.match(libSrc, /isScrapedWithinDays/);
assert.match(libSrc, /TOP_DISCOUNT_MAX_SCRAPE_AGE_MS/);

console.log("OK test-top-discounts");
