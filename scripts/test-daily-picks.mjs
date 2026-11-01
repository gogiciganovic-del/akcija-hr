/**
 * dailyPicks: deterministički dnevni izbor, nameKey, store filter, Zagreb ponoć/DST.
 * Pokreni: npm run test:daily-picks
 */
import {
  DAILY_MIN_DISCOUNT,
  DAILY_PICKS_MIN_VISIBLE,
  DAILY_POOL_SIZE,
  ITEM_CLASS_FOOD,
  ITEM_CLASS_HYGIENE,
  ITEM_CLASS_OTHER,
  buildDailyCandidatePool,
  classifyItem,
  formatZagrebShortDate,
  hasRealPhoto,
  hashString,
  isEverydayItem,
  nameKey,
  rankHotDeals,
  selectDailyPicks,
  shouldShowDailyPicks,
  tokenizeProductName,
} from "../src/lib/dailyPicks.js";
import { calendarDayKey } from "../src/lib/dealDates.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function ids(list) {
  return list.map((p) => String(p.product_id ?? p.id)).join(",");
}

function makeP(overrides) {
  const id = overrides.id ?? overrides.product_id ?? "x";
  return {
    id,
    product_id: overrides.product_id ?? id,
    name: overrides.name ?? `Proizvod ${id}`,
    chain: overrides.chain ?? "Lidl",
    store: overrides.store ?? "Lidl Zagreb",
    discount: overrides.discount ?? 30,
    image: overrides.image ?? "https://cdn.example.com/p.jpg",
    isGlitch: overrides.isGlitch ?? false,
    ...overrides,
  };
}

// --- hash stabilan ---
assert(hashString("2026-11-01:abc") === hashString("2026-11-01:abc"), "hash stable");
assert(hashString("a") !== hashString("b"), "hash differs");

// --- photo ---
assert(hasRealPhoto({ image: "https://x.test/a.jpg" }) === true, "https photo");
assert(hasRealPhoto({ image: "data:image/svg+xml,x" }) === false, "data uri not photo");
assert(hasRealPhoto({ image: "" }) === false, "empty not photo");
assert(hasRealPhoto({}) === false, "missing not photo");

// --- nameKey ---
assert(nameKey("Mlijeko 2,8% 1 L") === "mlijeko", "mlijeko key");
assert(nameKey("Coca-Cola 0,5 L") === "coca cola", "coca cola multi");
assert(nameKey("Čokolada milka 100g") === "cokolada", "diacritics + measure");
assert(tokenizeProductName("Sok 1,5L").includes("l") === false, "measure dropped");
assert(nameKey("Dr. Oetker puding") === "dr oetker", "dr oetker multi");
assert(nameKey("") === "", "empty name key");

// --- classifyItem / isEverydayItem ---
assert(classifyItem("Mlijeko 2,8% 1 L") === ITEM_CLASS_FOOD, "mlijeko hrana");
assert(classifyItem("Pivac Dimljena pečenica 100 g") === ITEM_CLASS_FOOD, "pecenica hrana");
assert(classifyItem("Nestle Nesquik žitne loptice 450 g") === ITEM_CLASS_FOOD, "nesquik hrana");
assert(classifyItem("Persil deterdžent 5 L") === ITEM_CLASS_HYGIENE, "persil higijena");
assert(classifyItem("Fa Men set gel") === ITEM_CLASS_HYGIENE, "fa higijena");
assert(classifyItem("Rimmel London sprej") === ITEM_CLASS_HYGIENE, "rimmel higijena");
assert(classifyItem("Emporio Armani toaletna voda 50 ml") === ITEM_CLASS_OTHER, "parfem ostalo");
assert(classifyItem("Božićni vijenac 24 cm") === ITEM_CLASS_OTHER, "vijenac ostalo");
assert(classifyItem("Posuda za maslac Spar") === ITEM_CLASS_OTHER, "posuda za ostalo");
assert(classifyItem("Kela valjak za tijesto") === ITEM_CLASS_OTHER, "valjak ostalo");
assert(classifyItem("Silvercrest Ultrazvučni čistač") === ITEM_CLASS_OTHER, "ultrazvucni ostalo");
assert(classifyItem("Delimano Chop Chop") === ITEM_CLASS_OTHER, "chop ostalo");
assert(isEverydayItem("Mlijeko") === true, "everyday food");
assert(isEverydayItem("Persil") === true, "everyday hygiene");
assert(isEverydayItem("LEGO set") === false, "not everyday lego");

assert(DAILY_MIN_DISCOUNT === 15, "min discount 15");
assert(DAILY_POOL_SIZE === 600, "pool size 600");

// --- pool: 15–50, foto, top 600 by discount ---
{
  const many = [];
  for (let i = 0; i < 50; i++) {
    many.push(
      makeP({
        id: `d${i}`,
        product_id: `d${i}`,
        discount: 10 + i, // 10..59
        name: `Item ${i}`,
        chain: i % 2 === 0 ? "Lidl" : "Konzum",
      })
    );
  }
  many.push(makeP({ id: "noimg", discount: 40, image: "data:image/svg+xml,x" }));
  many.push(makeP({ id: "hi", discount: 55, name: "Too high" }));
  const pool = buildDailyCandidatePool(many);
  assert(pool.every((p) => p.discount >= 15 && p.discount <= 50), "pool discount band");
  assert(pool.every((p) => hasRealPhoto(p)), "pool all photos");
  assert(!pool.some((p) => p.id === "noimg" || p.id === "hi"), "excluded bad");
  assert(pool[0].discount >= pool[pool.length - 1].discount, "pool sorted desc");
}

// --- prefer hrana (≥5), ≤3 higijena, ≤2 ostalo ---
{
  const products = [];
  const food =
    "mlijeko jogurt kruh sir maslac jaja tjestenina riza brasno secer kava caj sok pivo cokolada keks tuna sunka".split(
      " "
    );
  const hygiene = "persil ariel nivea colgate bref jar".split(" ");
  const other =
    "vijenac posteljina navlaka vjesalice igracka tipkovnica slusalice romobil".split(" ");
  const chains = ["Lidl", "Konzum", "Spar", "Plodine", "Tommy", "Kaufland", "Eurospin", "Dm"];
  food.forEach((w, i) => {
    products.push(
      makeP({
        id: `f${i}`,
        product_id: `f${i}`,
        name: `${w} ekstra`,
        chain: chains[i % chains.length],
        discount: 30,
      })
    );
  });
  hygiene.forEach((w, i) => {
    products.push(
      makeP({
        id: `h${i}`,
        product_id: `h${i}`,
        name: `${w} ekstra`,
        chain: chains[i % chains.length],
        discount: 40,
      })
    );
  });
  other.forEach((w, i) => {
    products.push(
      makeP({
        id: `o${i}`,
        product_id: `o${i}`,
        name: `${w} ekstra`,
        chain: chains[i % chains.length],
        discount: 45,
      })
    );
  });
  const picks = selectDailyPicks(products, {
    now: new Date("2026-11-01T12:00:00+01:00"),
  });
  const nFood = picks.filter((p) => classifyItem(p.name) === ITEM_CLASS_FOOD).length;
  const nHyg = picks.filter((p) => classifyItem(p.name) === ITEM_CLASS_HYGIENE).length;
  const nOth = picks.filter((p) => classifyItem(p.name) === ITEM_CLASS_OTHER).length;
  assert(nFood >= 5, `food >=5 got ${nFood}`);
  assert(nHyg <= 3, `hyg <=3 got ${nHyg}`);
  assert(nOth <= 2, `other <=2 got ${nOth}`);
}

// --- empty safe ---
assert(selectDailyPicks([]).length === 0, "empty select");
assert(shouldShowDailyPicks([]) === false, "empty hide");
assert(shouldShowDailyPicks([1, 2]) === false, "below min hide");
assert(DAILY_PICKS_MIN_VISIBLE === 3, "min visible 3");

// --- same day same picks; next day different ---
{
  const products = [];
  const chains = ["Lidl", "Konzum", "Spar", "Plodine", "Tommy", "Kaufland"];
  const words = "alfa beta gama delta epsilon zeta eta teta jota kapa lambda mi ni ksi omikron pi ro sigma tau ipsilon fi hi psi omega jabuka kruska sljiva tresnja breskva marelica smokva limun naranca grejp ananas mango papaja kokos kivi avokado rajcica paprika krastavac luk cesnjak mrkva" .split(
    " "
  );
  for (let i = 0; i < 80; i++) {
    products.push(
      makeP({
        id: `p${i}`,
        product_id: `p${i}`,
        name: `${words[i % words.length]} artikal ekstra`,
        chain: chains[i % chains.length],
        discount: 20 + (i % 31),
      })
    );
  }
  const d1 = new Date("2026-11-01T10:00:00+01:00");
  const d1b = new Date("2026-11-01T23:30:00+01:00");
  const d2 = new Date("2026-11-02T00:30:00+01:00");
  const a = selectDailyPicks(products, { now: d1 });
  const b = selectDailyPicks(products, { now: d1b });
  const c = selectDailyPicks(products, { now: d2 });
  assert(ids(a) === ids(b), "same Zagreb day → same picks");
  assert(ids(a) !== ids(c), "next day → different picks");
  assert(a.length === 10, `expect 10 picks got ${a.length}`);
  assert(calendarDayKey(d1) === "2026-11-01", "day key 1.11");
  assert(calendarDayKey(d2) === "2026-11-02", "day key 2.11");
}

// --- nameKey uniqueness (max 1) ---
{
  const products = [
    makeP({ id: "1", product_id: "1", name: "Mlijeko A 1L", chain: "Lidl", discount: 40 }),
    makeP({ id: "2", product_id: "2", name: "Mlijeko B 1L", chain: "Konzum", discount: 39 }),
    makeP({ id: "3", product_id: "3", name: "Jogurt C", chain: "Spar", discount: 38 }),
    makeP({ id: "4", product_id: "4", name: "Kruh D", chain: "Plodine", discount: 37 }),
    makeP({ id: "5", product_id: "5", name: "Sir E", chain: "Tommy", discount: 36 }),
  ];
  const picks = selectDailyPicks(products, {
    now: new Date("2026-11-01T12:00:00+01:00"),
  });
  const keys = picks.map((p) => nameKey(p.name));
  assert(new Set(keys).size === keys.length, "unique nameKey in picks");
  assert(!picks.some((p) => p.id === "2") || !picks.some((p) => p.id === "1") || keys.filter((k) => k === "mlijeko").length <= 1, "at most one mlijeko");
  assert(keys.filter((k) => k === "mlijeko").length <= 1, "mlijeko once");
}

// --- max 2 per store (no store filter) ---
{
  const products = [];
  const lidlNames =
    "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa quebec romeo sierra tango".split(
      " "
    );
  for (let i = 0; i < 20; i++) {
    products.push(
      makeP({
        id: `s${i}`,
        product_id: `s${i}`,
        name: `${lidlNames[i]} item`,
        chain: "Lidl",
        discount: 45 - (i % 10),
      })
    );
  }
  const konzumNames = "umbra victor whiskey xray yankee".split(" ");
  for (let i = 0; i < 5; i++) {
    products.push(
      makeP({
        id: `k${i}`,
        product_id: `k${i}`,
        name: `${konzumNames[i]} item`,
        chain: "Konzum",
        discount: 40,
      })
    );
  }
  const picks = selectDailyPicks(products, {
    now: new Date("2026-11-01T12:00:00+01:00"),
    storeFilterActive: false,
  });
  const lidl = picks.filter((p) => p.chain === "Lidl").length;
  assert(lidl <= 2, `Lidl cap 2 got ${lidl}`);
}

// --- store filter: no store cap ---
{
  const products = [];
  const names =
    "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen".split(
      " "
    );
  for (let i = 0; i < 15; i++) {
    products.push(
      makeP({
        id: `f${i}`,
        product_id: `f${i}`,
        name: `${names[i]} proizvod`,
        chain: "Lidl",
        discount: 35,
      })
    );
  }
  const picks = selectDailyPicks(products, {
    now: new Date("2026-11-01T12:00:00+01:00"),
    storeFilterActive: true,
  });
  assert(picks.length === 10, `store filter can fill 10 got ${picks.length}`);
  assert(picks.every((p) => p.chain === "Lidl"), "all same store ok");
}

// --- pool < 3 → shouldShow false ---
{
  const tiny = [
    makeP({ id: "a", product_id: "a", name: "Alpha", chain: "Lidl", discount: 30 }),
    makeP({ id: "b", product_id: "b", name: "Beta", chain: "Konzum", discount: 31 }),
  ];
  const picks = selectDailyPicks(tiny, { now: new Date("2026-11-01T12:00:00+01:00") });
  assert(picks.length === 2, "tiny pool length");
  assert(shouldShowDailyPicks(picks) === false, "hide when <3");
}

// --- product duplicate skip ---
{
  const products = [
    makeP({ id: "d1", product_id: "same", name: "Alpha one", chain: "Lidl", discount: 40 }),
    makeP({ id: "d2", product_id: "same", name: "Beta two", chain: "Konzum", discount: 39 }),
    makeP({ id: "d3", product_id: "u3", name: "Gamma three", chain: "Spar", discount: 38 }),
    makeP({ id: "d4", product_id: "u4", name: "Delta four", chain: "Tommy", discount: 37 }),
  ];
  const picks = selectDailyPicks(products, {
    now: new Date("2026-11-01T12:00:00+01:00"),
  });
  const pids = picks.map((p) => p.product_id);
  assert(new Set(pids).size === pids.length, "unique product_id");
  assert(pids.filter((x) => x === "same").length <= 1, "same product once");
}

// --- Zagreb midnight + DST ---
{
  const products = [];
  for (let i = 0; i < 40; i++) {
    const w = `rijec${String.fromCharCode(97 + Math.floor(i / 26))}${String.fromCharCode(97 + (i % 26))}`;
    products.push(
      makeP({
        id: `z${i}`,
        product_id: `z${i}`,
        name: `${w} stuff`,
        chain: ["Lidl", "Konzum", "Spar", "Plodine"][i % 4],
        discount: 25 + (i % 20),
      })
    );
  }
  // 1.11.2026 23:30 CET vs 2.11.2026 00:30 CET
  const beforeMidnight = new Date("2026-11-01T23:30:00+01:00");
  const afterMidnight = new Date("2026-11-02T00:30:00+01:00");
  assert(calendarDayKey(beforeMidnight) === "2026-11-01", "before midnight day");
  assert(calendarDayKey(afterMidnight) === "2026-11-02", "after midnight day");
  const pb = selectDailyPicks(products, { now: beforeMidnight });
  const pa = selectDailyPicks(products, { now: afterMidnight });
  assert(ids(pb) !== ids(pa), "midnight flips picks");

  // DST end 25.10.2026
  const dstEve = new Date("2026-10-25T00:30:00+02:00"); // still CEST early? actually 00:30+02 is before 03:00 transition on 25th
  const dstDay = new Date("2026-10-25T12:00:00+01:00");
  assert(calendarDayKey(dstEve) === "2026-10-25", "DST morning same calendar day");
  assert(calendarDayKey(dstDay) === "2026-10-25", "DST afternoon same calendar day");
  const pe = selectDailyPicks(products, { now: dstEve });
  const pd = selectDailyPicks(products, { now: dstDay });
  assert(ids(pe) === ids(pd), "same Zagreb calendar day across DST");
}

// --- formatZagrebShortDate ---
{
  const label = formatZagrebShortDate(new Date("2026-11-01T15:00:00+01:00"));
  assert(/1\.\s*11\./.test(label), `short date contains 1. 11. got "${label}"`);
  assert(/ned/i.test(label), `weekday ned got "${label}"`);
}

// --- rankHotDeals ---
{
  const hot = [];
  const otherHot =
    "maslac jogurt kruh pecivo secer brasno ulje sol papar ocet kecap majoneza senf med dzem".split(
      " "
    );
  for (let i = 0; i < 20; i++) {
    hot.push(
      makeP({
        id: `h${i}`,
        product_id: `h${i}`,
        name: i < 8 ? `Mlijeko var ${i}` : `${otherHot[i - 8]} x`,
        discount: 65 - (i % 10),
        isGlitch: true,
      })
    );
  }
  hot.push(makeP({ id: "over", discount: 80, isGlitch: true, name: "Glitch high" }));
  const ranked = rankHotDeals(hot);
  assert(!ranked.some((p) => p.id === "over"), "cut >70");
  const first12 = ranked.slice(0, 12);
  const mlijeko = first12.filter((p) => nameKey(p.name) === "mlijeko").length;
  assert(mlijeko <= 3, `max 3 mlijeko in first 12 got ${mlijeko}`);
}

console.log("OK daily-picks");
