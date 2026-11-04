/**
 * Gate za onboarding: tko smije vidjeti sheet.
 * Pokreni: npm run test:onboarding-gate
 */
import {
  ONBOARDING_DONE_KEY,
  FAVORITES_KEY,
  PUSH_ENDPOINT_KEY,
  FOLLOWED_CHAINS_KEY,
  CART_DRAFT_KEY,
  PREFERRED_STORES_KEY,
  INTEREST_KEY,
  shouldShowOnboarding,
  markOnboardingDone,
  readOnboardingDone,
  writePreferredStores,
  writeInterest,
  readPreferredStores,
  readInterest,
  orderStoresPreferredFirst,
} from "../src/lib/onboardingGate.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v);
    },
    removeItem: (k) => {
      delete data[k];
    },
    _data: data,
  };
}

function throwingStorage() {
  return {
    getItem() {
      throw new Error("denied");
    },
    setItem() {
      throw new Error("denied");
    },
  };
}

const humanUa = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile";
const emptySearch = "";

assert(ONBOARDING_DONE_KEY === "cjenko_onboarding_done", "ključ done");

// Novi korisnik — prazan storage
{
  const s = memoryStorage();
  assert(
    shouldShowOnboarding({ storage: s, userAgent: humanUa, search: emptySearch }) === true,
    "novi korisnik → true"
  );
}

// Već završeno
{
  const s = memoryStorage({ [ONBOARDING_DONE_KEY]: "1" });
  assert(
    shouldShowOnboarding({ storage: s, userAgent: humanUa, search: emptySearch }) === false,
    "done=1 → false"
  );
  assert(readOnboardingDone(s) === true, "readOnboardingDone");
}

// markOnboardingDone
{
  const s = memoryStorage();
  markOnboardingDone(s);
  assert(s.getItem(ONBOARDING_DONE_KEY) === "1", "mark piše 1");
  assert(
    shouldShowOnboarding({ storage: s, userAgent: humanUa, search: emptySearch }) === false,
    "nakon mark → false"
  );
}

// Stari: favoriti
{
  const s = memoryStorage({
    [FAVORITES_KEY]: JSON.stringify([["id1", { id: "id1", name: "X" }]]),
  });
  assert(
    shouldShowOnboarding({ storage: s, userAgent: humanUa, search: emptySearch }) === false,
    "favoriti → false"
  );
}

// Prazni favoriti [] ne blokiraju
{
  const s = memoryStorage({ [FAVORITES_KEY]: "[]" });
  assert(
    shouldShowOnboarding({ storage: s, userAgent: humanUa, search: emptySearch }) === true,
    "prazni favoriti → true"
  );
}

// Stari: push endpoint
{
  const s = memoryStorage({ [PUSH_ENDPOINT_KEY]: "https://fcm.googleapis.com/fcm/send/abc" });
  assert(
    shouldShowOnboarding({ storage: s, userAgent: humanUa, search: emptySearch }) === false,
    "push endpoint → false"
  );
}

// Stari: followed_chains
{
  const s = memoryStorage({
    [FOLLOWED_CHAINS_KEY]: JSON.stringify(["Eurospin"]),
  });
  assert(
    shouldShowOnboarding({ storage: s, userAgent: humanUa, search: emptySearch }) === false,
    "followed_chains → false"
  );
}

// Prazni followed_chains
{
  const s = memoryStorage({ [FOLLOWED_CHAINS_KEY]: "[]" });
  assert(
    shouldShowOnboarding({ storage: s, userAgent: humanUa, search: emptySearch }) === true,
    "prazni followed → true"
  );
}

// Stari: cart draft s stavkama
{
  const s = memoryStorage({
    [CART_DRAFT_KEY]: JSON.stringify({
      selectedChain: "Konzum",
      items: [{ name: "Mlijeko" }],
      lineOverrides: {},
    }),
  });
  assert(
    shouldShowOnboarding({ storage: s, userAgent: humanUa, search: emptySearch }) === false,
    "cart draft → false"
  );
}

// Cart draft bez stavki
{
  const s = memoryStorage({
    [CART_DRAFT_KEY]: JSON.stringify({
      selectedChain: null,
      items: [],
      lineOverrides: {},
    }),
  });
  assert(
    shouldShowOnboarding({ storage: s, userAgent: humanUa, search: emptySearch }) === true,
    "prazan cart draft → true"
  );
}

// Botovi
for (const ua of [
  "Googlebot/2.1",
  "Mozilla/5.0 compatible; bingbot/2.0",
  "facebookexternalhit/1.1 crawler",
  "Chrome-Lighthouse",
  "Something Spider/1.0",
]) {
  assert(
    shouldShowOnboarding({
      storage: memoryStorage(),
      userAgent: ua,
      search: emptySearch,
    }) === false,
    `bot UA ${ua} → false`
  );
}

// ?trgovina=
assert(
  shouldShowOnboarding({
    storage: memoryStorage(),
    userAgent: humanUa,
    search: "?trgovina=Konzum",
  }) === false,
  "?trgovina= → false"
);

// ?notrack=
assert(
  shouldShowOnboarding({
    storage: memoryStorage(),
    userAgent: humanUa,
    search: "?notrack=1",
  }) === false,
  "?notrack= → false"
);

assert(
  shouldShowOnboarding({
    storage: memoryStorage(),
    userAgent: humanUa,
    search: "?notrack=0",
  }) === false,
  "?notrack=0 (param postoji) → false"
);

// localStorage baca grešku
assert(
  shouldShowOnboarding({
    storage: throwingStorage(),
    userAgent: humanUa,
    search: emptySearch,
  }) === false,
  "storage throw → false"
);

markOnboardingDone(throwingStorage()); // ne smije baciti
assert(readOnboardingDone(throwingStorage()) === true, "read done pri throw → true (sigurno)");

// Preferred stores + interest + order
{
  const s = memoryStorage();
  writePreferredStores(["Plodine", "Lidl"], s);
  assert(
    JSON.stringify(readPreferredStores(s)) === JSON.stringify(["Plodine", "Lidl"]),
    "preferred stores roundtrip"
  );
  assert(s.getItem(PREFERRED_STORES_KEY), "preferred key set");
  writeInterest("higijena", s);
  assert(readInterest(s) === "higijena", "interest higijena");
  assert(s.getItem(INTEREST_KEY) === "higijena", "interest key");
  writeInterest("nope", s);
  assert(readInterest(s) === "higijena", "invalid interest ignored");

  const stores = [
    { id: "Lidl" },
    { id: "Kaufland" },
    { id: "Konzum" },
    { id: "Plodine" },
  ];
  const ordered = orderStoresPreferredFirst(stores, ["Plodine", "Lidl"]);
  assert(
    ordered.map((x) => x.id).join(",") === "Plodine,Lidl,Kaufland,Konzum",
    "preferred first order"
  );
}

console.log("OK onboarding-gate");
