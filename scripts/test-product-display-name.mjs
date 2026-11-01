/**
 * productDisplayName: skida „Akcija u trgovini …“ samo za prikaz.
 * Pokreni: npm run test:product-display-name
 */
import { productDisplayName } from "../src/lib/productDisplayName.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const cases = [
  {
    before: "Mlijeko 2,8% 1L Akcija u trgovini Konzum",
    after: "Mlijeko 2,8% 1L",
  },
  {
    before: "Banane 1 kg akcija u trgovini Lidl",
    after: "Banane 1 kg",
  },
  {
    before: "Jogurt 180g  AKCIJA U TRGOVINI  Spar Centar",
    after: "Jogurt 180g",
  },
  {
    before: "Kruh bijeli 500g",
    after: "Kruh bijeli 500g",
  },
  {
    before: "Kava mljevena 250g Akcija u trgovini Plodine Rijeka",
    after: "Kava mljevena 250g",
  },
];

console.log("prije → poslije");
for (const c of cases) {
  const got = productDisplayName(c.before);
  console.log(`  ${JSON.stringify(c.before)}`);
  console.log(`  → ${JSON.stringify(got)}`);
  assert(got === c.after, `expected ${JSON.stringify(c.after)}, got ${JSON.stringify(got)}`);
}

assert(productDisplayName(null) === "", "null → empty");
assert(productDisplayName("") === "", "empty → empty");

console.log("OK product-display-name (5 primjera)");
