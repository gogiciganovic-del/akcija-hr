/**
 * ProductSheet prikaz: productDisplayName + sakrivanje „dom“ / opisa.
 * (Logika sheet-a nije exportana — test helpera koje sheet koristi.)
 * Pokreni: npm run test:product-sheet-display
 */
import { productDisplayName } from "../src/lib/productDisplayName.js";
import { SHOW_EXPIRES_IN, productDateLabel } from "../src/lib/priceTrust.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const raw = "Fa Men set gel Akcija u trgovini Dm";
assert(productDisplayName(raw) === "Fa Men set gel", "strip suffix for sheet title");

assert(SHOW_EXPIRES_IN === false, "flag off");
const label = productDateLabel({
  name: raw,
  validUntil: "2026-11-08T12:00:00Z",
  scrapedAt: "2026-10-31T12:00:00Z",
  description: `${raw} na akciji. Popust 50%.`,
  category: "dom",
});
assert(label && label.startsWith("Ažurirano"), "no Akcija do");
assert(!String(label).includes("Akcija do"), "Akcija do hidden");

function shouldShowCategory(category) {
  const c = String(category || "").trim();
  return Boolean(c && c.toLowerCase() !== "dom");
}
assert(shouldShowCategory("dom") === false, "hide dom");
assert(shouldShowCategory("Dom") === false, "hide Dom");
assert(shouldShowCategory("mlijeko") === true, "show real category");
assert(shouldShowCategory("") === false, "empty hide");

console.log("OK product-sheet-display");
