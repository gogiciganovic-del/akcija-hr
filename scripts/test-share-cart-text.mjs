/**
 * buildShareCartText — kompletna, djelomična, božićna, bez uštede, € format.
 * Pokreni: node scripts/test-share-cart-text.mjs
 */
import assert from "node:assert/strict";
import {
  buildShareCartText,
  hasCompleteShareChain,
  joinHrLabels,
  SHARE_CART_URL,
} from "../src/lib/shareCartText.js";

const fmt = (v) =>
  (v ?? 0).toLocaleString("hr-HR", { style: "currency", currency: "EUR" });

function line(price) {
  return { available: true, price };
}
function missing() {
  return { available: false, price: null };
}

// --- joinHrLabels ---
assert.equal(joinHrLabels([]), "");
assert.equal(joinHrLabels(["Eurospin"]), "Eurospin");
assert.equal(joinHrLabels(["Eurospin", "Dm"]), "Eurospin i Dm");
assert.equal(joinHrLabels(["A", "B", "C"]), "A, B i C");

// --- kompletna (top 3 najjeftinija) ---
const completeResults = {
  itemCount: 6,
  primary: {
    chain: "Konzum",
    label: "Konzum",
    total: 6.62,
    savings: 0,
    lines: Array(6).fill(null).map(() => line(1.1)),
  },
  others: [
    {
      chain: "Plodine",
      label: "Plodine",
      total: 4.48,
      lines: Array(6).fill(null).map(() => line(0.7)),
    },
    {
      chain: "Kaufland",
      label: "Kaufland",
      total: 6.35,
      lines: Array(6).fill(null).map(() => line(1)),
    },
    {
      chain: "Spar",
      label: "Spar",
      total: 7.5,
      lines: Array(6).fill(null).map(() => line(1.2)),
    },
    {
      chain: "Eurospin",
      label: "Eurospin",
      total: 0,
      lines: Array(6).fill(null).map(() => missing()),
    },
  ],
};

assert.equal(hasCompleteShareChain(completeResults), true);

const ordinary = buildShareCartText(completeResults);
assert.ok(ordinary);
assert.ok(ordinary.startsWith("Moja košarica u Cjenku (6 artikala):"));
assert.ok(ordinary.includes(`Plodine ${fmt(4.48)}`));
assert.ok(ordinary.includes(`Kaufland ${fmt(6.35)}`));
assert.ok(ordinary.includes(`Konzum ${fmt(6.62)}`));
assert.ok(!ordinary.includes("Spar"), "samo top 3");
assert.ok(ordinary.includes("Najjeftinije: Plodine."));
assert.ok(!ordinary.includes("Ušteda na akcijama"));
assert.ok(ordinary.endsWith(SHARE_CART_URL));
assert.equal(SHARE_CART_URL, "https://www.cjenko.app");

console.log("--- ordinary complete ---");
console.log(ordinary);

// --- božićna + ušteda ---
const holiday = buildShareCartText(
  {
    ...completeResults,
    primary: { ...completeResults.primary, savings: 1.25 },
  },
  { isHoliday: true }
);
assert.ok(holiday.startsWith("Božićna košarica u Cjenku (6 artikala):"));
assert.ok(holiday.includes(`Ušteda na akcijama: ${fmt(1.25)}.`));
assert.ok(holiday.endsWith(SHARE_CART_URL));

console.log("--- holiday + savings ---");
console.log(holiday);

// --- bez uštede ispod praga ---
const tinySave = buildShareCartText({
  ...completeResults,
  primary: { ...completeResults.primary, savings: 0.05 },
});
assert.ok(!tinySave.includes("Ušteda na akcijama"));

// --- djelomična (nema kompletne) ---
const partialResults = {
  itemCount: 6,
  primary: {
    chain: "Plodine",
    label: "Plodine",
    total: 3.1,
    savings: 0.5,
    lines: [line(1), line(1), line(0.6), line(0.5), missing(), missing()],
  },
  others: [
    {
      chain: "Konzum",
      label: "Konzum",
      total: 2.0,
      lines: [line(1), line(1), missing(), missing(), missing(), missing()],
    },
  ],
};
assert.equal(hasCompleteShareChain(partialResults), false);
const partial = buildShareCartText(partialResults);
assert.ok(partial);
assert.ok(partial.startsWith("Moja košarica u Cjenku (6 artikala):"));
assert.ok(partial.includes(`Plodine ${fmt(3.1)} (4 od 6)`));
assert.ok(!partial.includes("Najjeftinije"));
assert.ok(partial.includes(`Ušteda na akcijama: ${fmt(0.5)}.`));

console.log("--- partial ---");
console.log(partial);

// --- prazno ---
assert.equal(buildShareCartText(null), null);
assert.equal(buildShareCartText({}), null);

console.log("OK test-share-cart-text");
