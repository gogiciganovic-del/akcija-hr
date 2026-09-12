/**
 * Regression: favorit s barkodom + favorit bez barkoda ne smije isprazniti tracked listu.
 * Pokreni: node scripts/test-push-tracked-barcodes.mjs
 */
import {
  barcodesFromFavorites,
  planTrackedBarcodesUpdate,
} from "../src/lib/pushTrackedBarcodes.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function sameBarcodes(a, b) {
  return [...a].sort().join("|") === [...b].sort().join("|");
}

const withBarcode = {
  id: "a",
  name: "Mlijeko s barkodom",
  barcode: "3850104012345",
};
const withoutBarcode = {
  id: "b",
  name: "Akcija bez barkoda",
  barcode: null,
};

const favorites = new Map([
  [withBarcode.id, withBarcode],
  [withoutBarcode.id, withoutBarcode],
]);

const extracted = barcodesFromFavorites(favorites);
assert(
  extracted.includes(withBarcode.barcode),
  `očekivan barkod ${withBarcode.barcode}, dobiveno ${JSON.stringify(extracted)}`
);
assert(extracted.length === 1, `očekivan 1 barkod, dobiveno ${extracted.length}`);

const plan = planTrackedBarcodesUpdate(favorites, {
  isInitialLoad: false,
  previousSynced: [withBarcode.barcode],
});
assert(plan.apply === true, `apply treba biti true, reason=${plan.reason}`);
assert(
  sameBarcodes(plan.barcodes, [withBarcode.barcode]),
  `tracked treba zadržati stari barkod, dobiveno ${JSON.stringify(plan.barcodes)}`
);
assert(plan.barcodes.length > 0, "tracked_barcodes ne smije postati []");

// Početni load s praznim Mapom ne smije obrisati ranije sinkronizirane barkodove.
const wipePlan = planTrackedBarcodesUpdate(new Map(), {
  isInitialLoad: true,
  previousSynced: [withBarcode.barcode],
});
assert(wipePlan.apply === false, "initial empty load treba skipati wipe");
assert(
  sameBarcodes(wipePlan.barcodes, [withBarcode.barcode]),
  "skip mora zadržati previousSynced"
);

// Nakon što korisnik stvarno obriše favorite (nije initial load) — smije očistiti.
const clearPlan = planTrackedBarcodesUpdate(new Map(), {
  isInitialLoad: false,
  previousSynced: [withBarcode.barcode],
});
assert(clearPlan.apply === true, "clear nakon interakcije treba apply");
assert(clearPlan.barcodes.length === 0, "clear treba []");

console.log("OK test-push-tracked-barcodes");
