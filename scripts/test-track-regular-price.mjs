/**
 * CTA praćenja redovne cijene — vidljivost i labele.
 * Pokreni: npm run test:track-regular-price
 */
import assert from "node:assert/strict";
import {
  TRACK_REGULAR_LABEL_IDLE,
  TRACK_REGULAR_LABEL_TRACKING,
  TRACK_REGULAR_NOTE,
  isTrackingRegularPrice,
  showTrackRegularPriceCta,
  trackRegularPriceButtonLabel,
} from "../src/lib/trackRegularPrice.js";

assert.equal(showTrackRegularPriceCta({ barcode: null }), false, "null");
assert.equal(showTrackRegularPriceCta({ barcode: undefined }), false, "undefined");
assert.equal(showTrackRegularPriceCta({}), false, "missing");
assert.equal(showTrackRegularPriceCta({ barcode: "1234567" }), false, "len 7");
assert.equal(showTrackRegularPriceCta({ barcode: "12345678" }), true, "len 8");
assert.equal(showTrackRegularPriceCta({ barcode: " 12345678 " }), true, "trim 8");
assert.equal(showTrackRegularPriceCta({ barcode: "3850123456789" }), true, "ean13");

const fav = (code) => String(code) === "3850123456789";
assert.equal(
  isTrackingRegularPrice({ barcode: "3850123456789" }, fav),
  true,
  "tracked"
);
assert.equal(
  isTrackingRegularPrice({ barcode: "3850123456789" }, () => false),
  false,
  "not tracked"
);
assert.equal(
  isTrackingRegularPrice({ barcode: "1234567" }, fav),
  false,
  "short never tracked"
);

assert.equal(
  trackRegularPriceButtonLabel(false),
  TRACK_REGULAR_LABEL_IDLE
);
assert.equal(
  trackRegularPriceButtonLabel(true),
  TRACK_REGULAR_LABEL_TRACKING
);
assert.ok(TRACK_REGULAR_NOTE.includes("redovnu"));
assert.ok(TRACK_REGULAR_LABEL_IDLE.includes("redovna"));

console.log("OK test-track-regular-price");
