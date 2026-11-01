/**
 * storeDisplayLabel: lanac iz chain/store (poslovnica → label iz STORES).
 * Pokreni: npm run test:store-display-label
 */
import { storeDisplayLabel, chainFromStoreName } from "../src/lib/constants.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(chainFromStoreName("Eurospin Dubrava") === "Eurospin", "chain Eurospin Dubrava");
assert(storeDisplayLabel({ store: "Eurospin Dubrava" }) === "Eurospin", "label from store");
assert(storeDisplayLabel({ chain: "Konzum", store: "Konzum Ilica" }) === "Konzum", "label from chain");
assert(storeDisplayLabel({ chain: "Lidl" }) === "Lidl", "label Lidl");
assert(storeDisplayLabel({ store: "Nepoznata trgovina XYZ" }) === null, "unknown null");
assert(storeDisplayLabel({}) === null, "empty null");
assert(storeDisplayLabel({ store: null }) === null, "store null");
assert(storeDisplayLabel({ store: "" }) === null, "store empty string");
assert(storeDisplayLabel({ chain: null, store: null }) === null, "chain+store null");
assert(storeDisplayLabel({ chain: "Dm" }) === "Dm", "Dm label");

console.log("OK store-display-label");
