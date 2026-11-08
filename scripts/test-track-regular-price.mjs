/**
 * CTA praćenja redovne cijene — vidljivost, favorit×push, greške.
 * Pokreni: npm run test:track-regular-price
 */
import assert from "node:assert/strict";
import {
  TRACK_REGULAR_DENIED,
  TRACK_REGULAR_ENABLE_FALLBACK,
  TRACK_REGULAR_LABEL_IDLE,
  TRACK_REGULAR_LABEL_TRACKING,
  TRACK_REGULAR_NOTE,
  isBarcodeInFavorites,
  isTrackingRegularPrice,
  showTrackRegularPriceCta,
  trackEnableErrorMessage,
  trackRegularPriceButtonLabel,
} from "../src/lib/trackRegularPrice.js";

assert.equal(showTrackRegularPriceCta({ barcode: null }), false, "null");
assert.equal(showTrackRegularPriceCta({ barcode: undefined }), false, "undefined");
assert.equal(showTrackRegularPriceCta({}), false, "missing");
assert.equal(showTrackRegularPriceCta({ barcode: "1234567" }), false, "len 7");
assert.equal(showTrackRegularPriceCta({ barcode: "12345678" }), true, "len 8");
assert.equal(showTrackRegularPriceCta({ barcode: " 12345678 " }), true, "trim 8");
assert.equal(showTrackRegularPriceCta({ barcode: "3850123456789" }), true, "ean13");

const product = { barcode: "3850123456789" };
const fav = (code) => String(code) === "3850123456789";
const noFav = () => false;

assert.equal(isBarcodeInFavorites(product, fav), true, "in fav");
assert.equal(isBarcodeInFavorites(product, noFav), false, "not in fav");
assert.equal(isBarcodeInFavorites({ barcode: "1234567" }, fav), false, "short");

// Pratim = favorit + subscribed
assert.equal(
  isTrackingRegularPrice(product, fav, "subscribed"),
  true,
  "fav + subscribed"
);
assert.equal(
  isTrackingRegularPrice(product, fav, "prompt"),
  false,
  "fav + prompt → idle"
);
assert.equal(
  isTrackingRegularPrice(product, fav, "denied"),
  false,
  "fav + denied → idle"
);
assert.equal(
  isTrackingRegularPrice(product, noFav, "subscribed"),
  false,
  "no fav + subscribed → idle"
);
assert.equal(
  isTrackingRegularPrice(product, noFav, "prompt"),
  false,
  "no fav + prompt"
);
assert.equal(
  isTrackingRegularPrice({ barcode: "1234567" }, fav, "subscribed"),
  false,
  "short never"
);

assert.equal(trackRegularPriceButtonLabel(false), TRACK_REGULAR_LABEL_IDLE);
assert.equal(trackRegularPriceButtonLabel(true), TRACK_REGULAR_LABEL_TRACKING);
assert.equal(
  trackRegularPriceButtonLabel(
    isTrackingRegularPrice(product, fav, "subscribed")
  ),
  TRACK_REGULAR_LABEL_TRACKING
);
assert.equal(
  trackRegularPriceButtonLabel(
    isTrackingRegularPrice(product, fav, "prompt")
  ),
  TRACK_REGULAR_LABEL_IDLE
);

assert.equal(trackEnableErrorMessage({ message: "busy" }), null, "busy silent");
assert.equal(
  trackEnableErrorMessage({ message: "Obavijesti su blokirane u postavkama preglednika" }),
  "Obavijesti su blokirane u postavkama preglednika"
);
assert.equal(trackEnableErrorMessage(null), TRACK_REGULAR_ENABLE_FALLBACK);
assert.equal(trackEnableErrorMessage({}), TRACK_REGULAR_ENABLE_FALLBACK);
assert.ok(TRACK_REGULAR_DENIED.includes("blokirane"));
assert.ok(TRACK_REGULAR_NOTE.includes("redovnu"));
assert.ok(TRACK_REGULAR_LABEL_IDLE.includes("redovna"));

console.log("OK test-track-regular-price");
