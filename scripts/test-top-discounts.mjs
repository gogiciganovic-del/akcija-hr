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
  isTopDiscountWindowOpen,
  shouldShowTopDiscountStrip,
  selectTopDiscounts,
  isDealNotExpired,
} from "../src/lib/topDiscounts.js";

const __dir = dirname(fileURLToPath(import.meta.url));

assert.equal(TOP_DISCOUNT_MIN, 40);
assert.equal(TOP_DISCOUNT_MAX, 70);
assert.equal(TOP_DISCOUNT_MAX_ITEMS, 8);
assert.equal(TOP_DISCOUNT_MIN_ITEMS, 5);
assert.equal(BF_WINDOW_START, "2026-11-20");
assert.equal(BF_WINDOW_END, "2026-11-30");

function product(partial) {
  return {
    id: partial.id || "x",
    name: partial.name || "Test",
    chain: partial.chain || "Lidl",
    store: partial.store || partial.chain || "Lidl",
    discount: partial.discount ?? 45,
    image: partial.image ?? "https://cdn.example.com/p.jpg",
    validUntil: partial.validUntil ?? "2099-12-31T12:00:00.000Z",
    ...partial,
  };
}

const future = "2099-01-01T12:00:00.000Z";
const past = "2020-01-01T12:00:00.000Z";

assert.equal(isDealNotExpired(product({ validUntil: future }), new Date("2026-11-25")), true);
assert.equal(isDealNotExpired(product({ validUntil: past }), new Date("2026-11-25")), false);
assert.equal(isDealNotExpired(product({ validUntil: null }), new Date("2026-11-25")), false);

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
  })
);

// 40–70 band
const band = selectTopDiscounts([
  product({ id: "low", chain: "Lidl", discount: 39, validUntil: future }),
  product({ id: "ok", chain: "Kaufland", discount: 40, validUntil: future }),
  product({ id: "hi", chain: "Konzum", discount: 70, validUntil: future }),
  product({ id: "over", chain: "Spar", discount: 71, validUntil: future }),
  ...many.slice(3, 7).map((p, i) => ({ ...p, id: `fill${i}`, discount: 50 + i })),
]);
assert.ok(band.every((p) => p.discount >= 40 && p.discount <= 70));
assert.equal(
  band.some((p) => p.id === "low" || p.id === "over"),
  false
);

// one per chain, highest discount wins
const dup = selectTopDiscounts([
  product({ id: "a1", chain: "Lidl", discount: 42, validUntil: future }),
  product({ id: "a2", chain: "Lidl", discount: 55, validUntil: future }),
  product({ id: "b", chain: "Kaufland", discount: 50, validUntil: future }),
  product({ id: "c", chain: "Konzum", discount: 48, validUntil: future }),
  product({ id: "d", chain: "Spar", discount: 47, validUntil: future }),
  product({ id: "e", chain: "Plodine", discount: 46, validUntil: future }),
]);
assert.equal(dup.find((p) => p.chain === "Lidl")?.id, "a2");
assert.equal(dup.filter((p) => p.chain === "Lidl").length, 1);

// max 8
const eight = selectTopDiscounts(many);
assert.equal(eight.length, 8);
assert.ok(eight[0].discount >= eight[1].discount);

// <5 → empty
const few = selectTopDiscounts(many.slice(0, 4));
assert.deepEqual(few, []);

// no photo / expired skipped
const filteredOut = selectTopDiscounts([
  product({ id: "nophoto", chain: "Lidl", discount: 50, image: "data:image/png;base64,xx" }),
  product({ id: "exp", chain: "Kaufland", discount: 50, validUntil: past }),
  ...many.slice(0, 5),
]);
assert.equal(filteredOut.some((p) => p.id === "nophoto" || p.id === "exp"), false);

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

console.log("OK test-top-discounts");
