/**
 * Ponuda dana + diversifikacija „Vruće ponude”.
 * Deterministički dnevni izbor (Europe/Zagreb), bez Math.random.
 */
import { calendarDayKey } from "./dealDates.js";
import { normalizeImageUrl } from "./productImage.js";

export const DAILY_PICKS_LIMIT = 10;
export const DAILY_PICKS_MIN_VISIBLE = 3;
export const DAILY_POOL_SIZE = 300;
export const DAILY_MIN_DISCOUNT = 20;
export const DAILY_MAX_DISCOUNT = 50;
export const DAILY_MAX_PER_STORE = 2;
export const HOT_MAX_DISCOUNT = 70;
export const HOT_WINDOW = 12;
export const HOT_MAX_PER_NAME_KEY = 3;

/** Poznate višerječne marke (nakon normalizacije, bez dijakritike). */
const MULTI_WORD_BRANDS = new Set([
  "coca cola",
  "dr oetker",
  "old spice",
  "uncle bens",
  "ben jerry",
  "ben jerrys",
  "haagen dazs",
  "le petit",
  "petit marseillais",
  "head shoulders",
  "nivea men",
  "nivea soft",
  "barilla pesto",
  "rio mare",
  "john west",
  "captain morgan",
  "jack daniel",
  "jack daniels",
  "red bull",
  "monster energy",
  "alpro soya",
  "alpro oat",
  "vileda style",
  "wc ente",
  "wc net",
  "finish quantum",
  "fairy platinum",
  "ariel pods",
  "persil discs",
  "lenor unstoppables",
  "air wick",
  "glade sense",
  "mr proper",
  "mr muscle",
  "cif cream",
  "domestos power",
  "palmolive naturals",
  "colgate total",
  "oral b",
  "loreal paris",
  "l oreal",
  "neutrogena hydro",
  "gillette fusion",
  "gillette venus",
  "nivea sun",
  "garnier fructis",
  "schwarzkopf got2b",
  "dm bio",
  "balea med",
  "dontodent soft",
  "denkmit multi",
  "sidolin crystal",
  "frosch citrus",
  "froggy frog",
]);

/** Mjerne / pakiranje riječi koje se odbacuju iz ključa. */
const MEASURE_STOP = new Set([
  "g",
  "kg",
  "mg",
  "ml",
  "l",
  "cl",
  "dl",
  "kom",
  "komad",
  "komada",
  "pak",
  "paket",
  "pakiranje",
  "kutija",
  "boc",
  "boca",
  "boce",
  "limenka",
  "kesica",
  "kesice",
  "roll",
  "rola",
  "role",
  "set",
  "duo",
  "trio",
  "pack",
  "pcs",
  "x",
]);

/** Stop-riječi na početku naziva (ne broje se kao „smislena” prva riječ). */
const LEADING_STOP = new Set([
  "a",
  "i",
  "u",
  "s",
  "sa",
  "za",
  "od",
  "na",
  "the",
  "new",
  "novo",
  "nova",
  "novi",
]);

/**
 * FNV-1a 32-bit — stabilan, bez Math.random.
 * @param {string} str
 * @returns {number} unsigned 32-bit
 */
export function hashString(str) {
  let h = 2166136261;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Ima li stvarnu (http/https) fotografiju — ne data: placeholder.
 * @param {{ image?: string, imageUrl?: string, image_url?: string }} product
 */
export function hasRealPhoto(product) {
  if (!product) return false;
  const raw = product.imageUrl ?? product.image_url ?? product.image;
  if (typeof raw !== "string" || !raw.trim()) return false;
  if (raw.startsWith("data:")) return false;
  return Boolean(normalizeImageUrl(raw));
}

/**
 * Normaliziraj naziv: mala slova, bez dijakritike, bez brojeva / mjernih jedinica.
 * @param {string} name
 * @returns {string[]} tokens
 */
export function tokenizeProductName(name) {
  const base = String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[''`]/g, "")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!base) return [];
  return base.split(" ").filter((w) => {
    if (!w) return false;
    if (MEASURE_STOP.has(w)) return false;
    if (/^\d+$/.test(w)) return false;
    return true;
  });
}

/**
 * Ključ naziva: prva smislena riječ, ili prve dvije za poznate višerječne marke.
 * @param {string} name
 * @returns {string}
 */
export function nameKey(name) {
  const tokens = tokenizeProductName(name);
  let i = 0;
  while (i < tokens.length && LEADING_STOP.has(tokens[i])) i += 1;
  if (i >= tokens.length) {
    return tokens[0] || "";
  }
  const a = tokens[i];
  const b = tokens[i + 1];
  if (b) {
    const two = `${a} ${b}`;
    if (MULTI_WORD_BRANDS.has(two)) return two;
  }
  return a;
}

/**
 * Kratki datum po Zagreb vremenu, npr. "ned. 1. 11."
 * @param {Date} [now]
 */
export function formatZagrebShortDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("hr-HR", {
    timeZone: "Europe/Zagreb",
    weekday: "short",
    day: "numeric",
    month: "numeric",
  }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type)?.value || "";
  let weekday = get("weekday").replace(/\.$/, "");
  if (weekday) weekday = `${weekday}.`;
  const day = String(get("day") || "").replace(/^0+/, "") || get("day");
  const month = String(get("month") || "").replace(/^0+/, "") || get("month");
  if (!weekday || !day || !month) {
    const key = calendarDayKey(now);
    return key || "";
  }
  return `${weekday} ${day}. ${month}.`;
}

function storeKey(product) {
  return String(product?.chain || product?.store || "").trim().toLowerCase() || "_";
}

function productIdentity(product) {
  if (product?.product_id != null && product.product_id !== "") {
    return String(product.product_id);
  }
  if (product?.productId != null && product.productId !== "") {
    return String(product.productId);
  }
  return String(product?.id ?? "");
}

function discountOf(product) {
  const d = Number(product?.discount);
  return Number.isFinite(d) ? d : 0;
}

/**
 * Skup: 20–50% + foto, sort po popustu desc, prvih 300.
 * @param {Array<object>} products
 * @param {{ poolSize?: number, minDiscount?: number, maxDiscount?: number }} [opts]
 */
export function buildDailyCandidatePool(products, opts = {}) {
  const poolSize = opts.poolSize ?? DAILY_POOL_SIZE;
  const minD = opts.minDiscount ?? DAILY_MIN_DISCOUNT;
  const maxD = opts.maxDiscount ?? DAILY_MAX_DISCOUNT;
  const list = Array.isArray(products) ? products : [];
  const filtered = list.filter((p) => {
    const d = discountOf(p);
    return d >= minD && d <= maxD && hasRealPhoto(p);
  });
  filtered.sort((a, b) => {
    const dd = discountOf(b) - discountOf(a);
    if (dd !== 0) return dd;
    return productIdentity(a).localeCompare(productIdentity(b));
  });
  return filtered.slice(0, poolSize);
}

/**
 * Dnevni izbor (deterministički).
 * @param {Array<object>} products
 * @param {{
 *   now?: Date,
 *   limit?: number,
 *   storeFilterActive?: boolean,
 *   maxPerStore?: number,
 * }} [opts]
 * @returns {object[]}
 */
export function selectDailyPicks(products, opts = {}) {
  const now = opts.now ?? new Date();
  const limit = opts.limit ?? DAILY_PICKS_LIMIT;
  const storeFilterActive = Boolean(opts.storeFilterActive);
  const maxPerStore = opts.maxPerStore ?? DAILY_MAX_PER_STORE;
  const dayKey = calendarDayKey(now);
  if (!dayKey) return [];

  const pool = buildDailyCandidatePool(products, opts);
  if (pool.length === 0) return [];

  const scored = pool.map((p) => {
    const pid = productIdentity(p);
    const score = hashString(`${dayKey}:${pid}`);
    return { p, pid, score, nk: nameKey(p.name), sk: storeKey(p) };
  });
  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    return a.pid.localeCompare(b.pid);
  });

  const picked = [];
  const seenProduct = new Set();
  const seenNameKey = new Set();
  const storeCounts = new Map();

  for (const row of scored) {
    if (picked.length >= limit) break;
    if (!row.pid || seenProduct.has(row.pid)) continue;
    if (row.nk && seenNameKey.has(row.nk)) continue;
    if (!storeFilterActive) {
      const c = storeCounts.get(row.sk) || 0;
      if (c >= maxPerStore) continue;
    }
    picked.push(row.p);
    seenProduct.add(row.pid);
    if (row.nk) seenNameKey.add(row.nk);
    if (!storeFilterActive) {
      storeCounts.set(row.sk, (storeCounts.get(row.sk) || 0) + 1);
    }
  }
  return picked;
}

/** Treba li prikazati blok (najmanje DAILY_PICKS_MIN_VISIBLE). */
export function shouldShowDailyPicks(picks) {
  return Array.isArray(picks) && picks.length >= DAILY_PICKS_MIN_VISIBLE;
}

/**
 * Vruće ponude: isGlitch + discount <= 70, u prvih 12 najviše 3 po nameKey.
 * @param {Array<object>} products  (obično već sortirani po discount desc)
 * @param {{ maxDiscount?: number, windowSize?: number, maxPerNameKey?: number }} [opts]
 */
export function rankHotDeals(products, opts = {}) {
  const maxDiscount = opts.maxDiscount ?? HOT_MAX_DISCOUNT;
  const windowSize = opts.windowSize ?? HOT_WINDOW;
  const maxPerKey = opts.maxPerNameKey ?? HOT_MAX_PER_NAME_KEY;
  const list = Array.isArray(products) ? products : [];
  const hot = list.filter((p) => p?.isGlitch && discountOf(p) <= maxDiscount);

  const window = [];
  const deferred = [];
  const keyCounts = new Map();

  for (const p of hot) {
    if (window.length >= windowSize) {
      deferred.push(p);
      continue;
    }
    const nk = nameKey(p.name) || `id:${productIdentity(p)}`;
    const c = keyCounts.get(nk) || 0;
    if (c >= maxPerKey) {
      deferred.push(p);
      continue;
    }
    window.push(p);
    keyCounts.set(nk, c + 1);
  }

  // Nakon prozora: dodaj odgođene pa ostatak (bez oštre ograde)
  return window.concat(deferred);
}
