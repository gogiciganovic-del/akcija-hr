/**
 * Soft push uvjeti: prompt/subscribed/denied × barkod/letak/ništa × već prikazan.
 * Pokreni: npm run test:soft-push-prompt
 */
import {
  SOFT_PUSH_DONE_KEY,
  SOFT_PUSH_DONE_VALUE,
  SOFT_PUSH_LABEL_PRICE,
  isSilentFavoriteToggleOpts,
  isSoftPushPromptDone,
  markSoftPushPromptDone,
  resolveSoftPushOffer,
  shouldAttemptSoftPushAfterToggle,
  shouldShowSoftPushPrompt,
} from "../src/lib/softPushPrompt.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem(k) {
      return map.has(k) ? map.get(k) : null;
    },
    setItem(k, v) {
      map.set(k, String(v));
    },
  };
}

const withBarcode = {
  id: "1",
  barcode: "3850123456789",
  chain: "Konzum",
  name: "Mlijeko",
};
const flyerOnly = {
  id: "2",
  barcode: null,
  chain: "Kaufland",
  name: "Letak artikal",
};
const neither = {
  id: "3",
  barcode: "12",
  chain: "Lidl",
  name: "Bez tracka",
};

// --- resolveSoftPushOffer ---
const priceOffer = resolveSoftPushOffer(withBarcode);
assert(priceOffer?.kind === "price", "barcode → price");
assert(priceOffer.message === SOFT_PUSH_LABEL_PRICE, "price message");

const flyerOffer = resolveSoftPushOffer(flyerOnly);
assert(flyerOffer?.kind === "flyer", "flyer chain → flyer");
assert(
  flyerOffer.message.includes("Kaufland"),
  `flyer message has chain, got ${flyerOffer.message}`
);

assert(resolveSoftPushOffer(neither) === null, "neither → null");
assert(resolveSoftPushOffer(null) === null, "null product");

// barkod ima prednost nad letkom
const both = { ...withBarcode, chain: "Eurospin" };
assert(resolveSoftPushOffer(both)?.kind === "price", "barcode wins over flyer");

// --- shouldShowSoftPushPrompt matrix ---
const statuses = ["prompt", "subscribed", "denied", "unsupported"];
const products = [
  ["barcode", withBarcode],
  ["flyer", flyerOnly],
  ["none", neither],
];

for (const status of statuses) {
  for (const [label, product] of products) {
    const storage = memoryStorage();
    const show = shouldShowSoftPushPrompt({
      pushStatus: status,
      product,
      storage,
    });
    const expect =
      status === "prompt" && (label === "barcode" || label === "flyer");
    assert(
      show === expect,
      `status=${status} product=${label}: expected ${expect}, got ${show}`
    );
  }
}

// već prikazan
{
  const storage = memoryStorage({
    [SOFT_PUSH_DONE_KEY]: SOFT_PUSH_DONE_VALUE,
  });
  assert(
    shouldShowSoftPushPrompt({
      pushStatus: "prompt",
      product: withBarcode,
      storage,
    }) === false,
    "already done → false"
  );
  assert(isSoftPushPromptDone(storage) === true, "isSoftPushPromptDone");
}

// markSoftPushPromptDone
{
  const storage = memoryStorage();
  assert(isSoftPushPromptDone(storage) === false, "fresh not done");
  markSoftPushPromptDone(storage);
  assert(isSoftPushPromptDone(storage) === true, "marked done");
  assert(
    shouldShowSoftPushPrompt({
      pushStatus: "prompt",
      product: withBarcode,
      storage,
    }) === false,
    "after mark → false"
  );
}

// bez LS → ne prikazuj
assert(
  shouldShowSoftPushPrompt({
    pushStatus: "prompt",
    product: withBarcode,
    storage: null,
  }) === false,
  "null storage → false"
);

// session blocked
assert(
  shouldShowSoftPushPrompt({
    pushStatus: "prompt",
    product: withBarcode,
    storage: memoryStorage(),
    sessionBlocked: true,
  }) === false,
  "sessionBlocked → false"
);

// --- shouldAttemptSoftPushAfterToggle / silent ---
assert(
  shouldAttemptSoftPushAfterToggle({ wasFavorite: false, opts: undefined }) ===
    true,
  "add without opts → attempt"
);
assert(
  shouldAttemptSoftPushAfterToggle({
    wasFavorite: false,
    opts: { silent: true },
  }) === false,
  "silent true → no attempt"
);
assert(
  shouldAttemptSoftPushAfterToggle({ wasFavorite: true, opts: undefined }) ===
    false,
  "remove → no attempt"
);
assert(
  shouldAttemptSoftPushAfterToggle({
    wasFavorite: true,
    opts: { silent: true },
  }) === false,
  "remove+silent → no attempt"
);
assert(
  shouldAttemptSoftPushAfterToggle({
    wasFavorite: false,
    opts: { preventDefault() {}, type: "click" },
  }) === true,
  "event-like opts → not silent, attempt"
);
assert(isSilentFavoriteToggleOpts({ silent: true }) === true, "silent flag");
assert(
  isSilentFavoriteToggleOpts({ preventDefault() {} }) === false,
  "event not silent"
);
assert(isSilentFavoriteToggleOpts(undefined) === false, "undefined not silent");

console.log("OK soft-push-prompt");
