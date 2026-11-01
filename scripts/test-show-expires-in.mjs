/**
 * SHOW_EXPIRES_IN=false: nema „Još Nd“ iz expiresIn; logika ostaje.
 * Pokreni: npm run test:show-expires-in
 */
import {
  SHOW_EXPIRES_IN,
  SHOW_EXPIRING_CHIP,
  productDateLabel,
} from "../src/lib/priceTrust.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(SHOW_EXPIRES_IN === false, "SHOW_EXPIRES_IN must be false");
assert(SHOW_EXPIRING_CHIP === false, "SHOW_EXPIRING_CHIP must be false");

const onlyExpires = productDateLabel({ expiresIn: "7d" });
assert(
  onlyExpires === null || !String(onlyExpires).includes("Još"),
  `expiresIn alone must not show Još, got ${JSON.stringify(onlyExpires)}`
);

const withScraped = productDateLabel({
  expiresIn: "7d",
  scrapedAt: "2026-11-01T12:00:00Z",
});
assert(
  withScraped && withScraped.startsWith("Ažurirano"),
  `fallback to scraped, got ${JSON.stringify(withScraped)}`
);

const withUntil = productDateLabel({
  expiresIn: "7d",
  validUntil: "2026-11-08T12:00:00Z",
});
assert(
  withUntil && withUntil.startsWith("Akcija do"),
  `validUntil still shown, got ${JSON.stringify(withUntil)}`
);

console.log("OK show-expires-in (flag off, Još hidden)");
