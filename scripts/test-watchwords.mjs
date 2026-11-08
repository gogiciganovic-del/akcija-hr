/**
 * watchwords: fold, word-boundary, cap 10, duplikati, storage.
 * Pokreni: npm run test:watchwords
 *
 * Poznati false positive: „piletina” i dalje može pogoditi „hrana za pse … piletina”
 * (word-boundary na tokenu, ne semantički filter). Zabilježeno namjerno.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  WATCHWORDS_MAX,
  addWatchword,
  removeWatchword,
  foldWatchText,
  nameMatchesWatchword,
  normalizeWatchwordInput,
  readWatchwords,
  writeWatchwords,
  groupOffersByWatchwords,
  countWatchwordHits,
} from "../src/lib/watchwords.js";
import {
  WATCHWORDS_FETCH_LIMIT,
  WATCHWORDS_FETCH_LIMIT_WIDENED,
  buildWatchwordIlikeQuery,
  clearWatchwordsFetchCache,
  escapeIlike,
  loadWatchwordGroup,
  loadWatchwordGroups,
  pickOffersForWatchword,
} from "../src/lib/watchwordsFetch.js";

const watchwordsSrc = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/lib/watchwords.js"),
  "utf8"
);
if (watchwordsSrc.includes("(?<!")) {
  throw new Error("watchwords.js još sadrži lookbehind (?<!");
}
if (watchwordsSrc.includes("(?<")) {
  throw new Error('watchwords.js još sadrži "(?<"');
}

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

assert(foldWatchText("Čokolada") === "cokolada", "fold č");
assert(foldWatchText("ŠLJIVA") === "sljiva", "fold š");
assert(foldWatchText("đak") === "dak", "fold đ");
assert(nameMatchesWatchword("Milka čokolada 100 g", "cokolada"), "čokolada ↔ cokolada");
assert(nameMatchesWatchword("Milka čokolada 100 g", "čokolada"), "čokolada NFC");
assert(nameMatchesWatchword("Sok od naranđe 1 L", "narande"), "đ ↔ d");
assert(!nameMatchesWatchword("kavalar salata", "kava"), "ne substring unutar riječi");
assert(nameMatchesWatchword("Franck kava mljevena", "kava"), "kava word");

// Poznati false positive (semantika nije filtrirana):
assert(
  nameMatchesWatchword("Dein Bestes hrana za pse piletina u umaku", "piletina"),
  "piletina false-positive dokumentiran"
);

assert(normalizeWatchwordInput("  kava  ") === "kava", "trim");
assert(normalizeWatchwordInput("ab") === null, "min 3");
assert(normalizeWatchwordInput("x".repeat(41)) === null, "max 40");

let words = [];
let r = addWatchword(words, "Kava");
assert(r.ok && r.words.length === 1, "add");
words = r.words;
r = addWatchword(words, "kava");
assert(!r.ok && r.reason === "duplicate", "duplikat fold");
r = addWatchword(words, "káva");
assert(!r.ok && r.reason === "duplicate", "duplikat dijakritika");

words = [];
for (let i = 0; i < WATCHWORDS_MAX; i++) {
  r = addWatchword(words, `rij${i}x`);
  assert(r.ok, `cap fill ${i}`);
  words = r.words;
}
assert(words.length === 10, "full 10");
r = addWatchword(words, "josjedna");
assert(!r.ok && r.reason === "cap", "cap 10");

r = removeWatchword(words, "rij0x");
assert(r.ok && r.words.length === 9, "remove");

const store = memoryStorage();
assert(writeWatchwords(["nutella", "pelene"], store), "write");
assert(
  JSON.stringify(readWatchwords(store)) === JSON.stringify(["nutella", "pelene"]),
  "read"
);
assert(readWatchwords(throwingStorage()).length === 0, "storage fail → []");
assert(writeWatchwords(["x"], throwingStorage()) === false, "write fail");

const products = [
  { id: "1", name: "Franck kava 250 g" },
  { id: "2", name: "Nescafe instant kava" },
  { id: "3", name: "Ferrero Nutella 350 g" },
  { id: "4", name: "Kruh bijeli" },
];
const groups = groupOffersByWatchwords(products, ["kava", "nutella", "pelene"], 6);
assert(groups[0].offers.length === 2, "kava group");
assert(groups[1].offers.length === 1, "nutella group");
assert(groups[2].offers.length === 0, "pelene no match");
assert(countWatchwordHits(groups) === 3, "hit count");

// max 6
const many = Array.from({ length: 20 }, (_, i) => ({
  id: String(i),
  name: `Test kava ${i}`,
}));
const capped = groupOffersByWatchwords(many, ["kava"], 6);
assert(capped[0].offers.length === 6, "max 6");

// --- fetch: pick + cache (mock upit) ---
clearWatchwordsFetchCache();

const ilikeCandidates = [
  { id: "a", name: "Franck kava 250 g" },
  { id: "b", name: "kavalar salata" }, // substring — word-boundary odbija
  { id: "c", name: "Nescafe instant kava" },
  { id: "d", name: "Lavazza kava Espresso" },
];
const picked = pickOffersForWatchword(ilikeCandidates, "kava", 6);
assert(picked.length === 3, "pick word-boundary filtrira kavalar");
assert(
  picked.every((p) => nameMatchesWatchword(p.name, "kava")),
  "pick svi matchaju"
);

// „cokolada” (bez dijakritike) → klijentski fold i dalje pogađa „Čokolada …”
assert(
  pickOffersForWatchword(
    [{ id: "cok", name: "Čokolada mliječna 100 g" }],
    "cokolada",
    6
  ).length === 1,
  "cokolada ↔ Čokolada mliječna"
);

// Riječ samo u brandu (adaptDeal inače ne mapira brand; fetch ga dodaje kao `brand`)
assert(
  pickOffersForWatchword(
    [{ id: "br1", name: "Tablete za perilicu", brand: "Finish" }],
    "finish",
    6
  ).length === 1,
  "match samo u brandu"
);
assert(
  pickOffersForWatchword(
    [{ id: "br2", name: "Tablete za perilicu", brand: "Somat" }],
    "finish",
    6
  ).length === 0,
  "brand miss"
);

const manyCand = Array.from({ length: 20 }, (_, i) => ({
  id: `m${i}`,
  name: `Akcija kava ${i}`,
}));
assert(pickOffersForWatchword(manyCand, "kava", 6).length === 6, "pick max 6");

// escapeIlike + dijakritika uzorak (bez izvršavanja upita)
assert(escapeIlike('a%b_c,d(e)f*g"h\\i') === "abcdefghi", "escape ekstra znakovi");
const qCok = buildWatchwordIlikeQuery("cokolada");
assert(qCok && qCok.needle === "_okola_a", `cokolada needle got ${qCok?.needle}`);
assert(qCok.widened === true, "cokolada widened");
assert(qCok.limit === WATCHWORDS_FETCH_LIMIT_WIDENED, "cokolada limit 80");
const qKava = buildWatchwordIlikeQuery("kava");
assert(qKava && qKava.needle === "kava", "kava needle nepromijenjen");
assert(qKava.widened === false, "kava not widened chars");
assert(qKava.limit === WATCHWORDS_FETCH_LIMIT_WIDENED, "kava bez dijakritike → limit 80");
const qCokDia = buildWatchwordIlikeQuery("čokolada");
assert(qCokDia && qCokDia.needle === "čokolada", "čokolada needle ostaje");
assert(qCokDia.widened === false, "čokolada not widened");
assert(qCokDia.limit === WATCHWORDS_FETCH_LIMIT, "čokolada limit 40");

let fetchCalls = 0;
const mockFetch = async (word) => {
  fetchCalls += 1;
  return [
    { id: `${word}-1`, name: `Test ${word} jedan` },
    { id: `${word}-2`, name: `Bezpogotka drugi` },
  ];
};

clearWatchwordsFetchCache();
fetchCalls = 0;
const g1 = await loadWatchwordGroup("kava", { fetchFn: mockFetch, now: 1000 });
assert(!g1.fromCache && g1.offers.length === 1, "prvi fetch");
assert(fetchCalls === 1, "1 call");
const g2 = await loadWatchwordGroup("kava", { fetchFn: mockFetch, now: 1000 + 60_000 });
assert(g2.fromCache && g2.offers.length === 1, "cache hit unutar 5 min");
assert(fetchCalls === 1, "bez drugog calla");
const g3 = await loadWatchwordGroup("kava", {
  fetchFn: mockFetch,
  now: 1000 + 6 * 60_000,
});
assert(!g3.fromCache && fetchCalls === 2, "cache expire → novi fetch");

clearWatchwordsFetchCache();
fetchCalls = 0;
const batch = await loadWatchwordGroups(["kava", "nutella"], {
  fetchFn: mockFetch,
  now: 1,
});
assert(batch.groups.length === 2, "batch 2");
assert(batch.hitCount === 2, "batch hits");
assert(fetchCalls === 2, "paralelno 2 calla");
const batch2 = await loadWatchwordGroups(["kava", "nutella"], {
  fetchFn: mockFetch,
  now: 1,
});
assert(fetchCalls === 2, "batch cache");
assert(!batch2.allFailed, "nije allFailed");

clearWatchwordsFetchCache();
const failFetch = async () => {
  throw new Error("network");
};
const failed = await loadWatchwordGroups(["kava"], { fetchFn: failFetch, now: 1 });
assert(failed.allFailed, "allFailed na grešci");
assert(failed.groups[0].error, "error poruka");

console.log("OK test-watchwords");
