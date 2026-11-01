/**
 * Ponuda dana + diversifikacija „Vruće ponude”.
 * Deterministički dnevni izbor (Europe/Zagreb), bez Math.random.
 */
import { calendarDayKey } from "./dealDates.js";
import { normalizeImageUrl } from "./productImage.js";

export const DAILY_PICKS_LIMIT = 10;
export const DAILY_PICKS_MIN_VISIBLE = 3;
export const DAILY_POOL_SIZE = 600;
export const DAILY_MIN_DISCOUNT = 15;
export const DAILY_MAX_DISCOUNT = 50;
export const DAILY_MAX_PER_STORE = 2;
export const DAILY_MIN_EVERYDAY = 7;
export const DAILY_MAX_OTHER = 3;
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

/** Normaliziran naziv za klasifikaciju (mala slova, bez dijakritike). */
export function normalizeEverydayName(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[''`]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * „Ostalo”: dekoracija, tekstil/posteljina, aparati/posuđe, alati, odjeća, igračke, sezonski ukrasi.
 * Provjerava se PRIJE everyday — eksplicitni reject.
 */
const OTHER_KEYWORDS = [
  "dekoracija",
  "dekorativ",
  "ukras",
  "ukrasni",
  "vijenac",
  "vijenci",
  "girlanda",
  "bozicn",
  "bozic",
  "novogodis",
  "uskrs",
  "halloween",
  "svijece",
  "svijeca",
  "svjetiljk",
  "lampion",
  "posteljin",
  "jastucnic",
  "jastuk",
  "pokriva",
  "prekrivac",
  "deka",
  "ćebe",
  "cebe",
  "rucnik",
  "peskir",
  "kupaliski",
  "navlaka",
  "navlake",
  "vjesalic",
  "vjesaj",
  "garderoba",
  "odijelo",
  "hlace",
  "majica",
  "dukserica",
  "jakna",
  "kaput",
  "carape",
  "carapa",
  "gace",
  "donje rublje",
  "pidzama",
  "papuce",
  "cipele",
  "tenisice",
  "torba",
  "ruksak",
  "igrack",
  "slagalic",
  "lego",
  "sjeckalic",
  "mikser",
  "blender",
  "toster",
  "pegela",
  "usisivac",
  "fen ",
  " fen",
  "kuhinjski aparat",
  "friteza",
  "pecnic",
  "tiganj",
  "tave",
  "tanjur",
  "tanjiri",
  "pribor za jelo",
  "vilica",
  "noz za",
  "lonac",
  "lonci",
  "set posuda",
  "set za fondue",
  "fondue",
  "chop chop",
  "sjeckalica",
  "delimano",
  "alat",
  "cekic",
  "odvijac",
  "svrdlo",
  "busilica",
  "elektronika",
  "slusalice",
  "punjac",
  "baterij",
  "powerbank",
  "usb",
  "tv ",
  "monitor",
  "tipkovnic",
  "mis ",
  "stolac",
  "stolovi",
  "stol ",
  "polica",
  "ormaric",
  "tepih",
  "prostirka",
  "zavjesa",
  "zavjese",
  "okvir za sliku",
  "fotografija",
  "album",
  "biljeznica",
  "olovka",
  "bojice",
  "flomaster",
  "knjiga",
  "slagalica",
  "puzzle",
  "bicikl",
  "romobil",
  "kaciga",
];

/**
 * Svakodnevno: hrana, piće, higijena/kozmetika, deterdženti i čišćenje.
 * Uključuje tokene iz productTypes + dodatne robne marke / higijena.
 */
const EVERYDAY_KEYWORDS = [
  // hrana / piće (iz productTypes + uobičajeno)
  "mlijeko",
  "jogurt",
  "kefir",
  "vrhnje",
  "slag",
  "sir ",
  " sir",
  "mozzarella",
  "maslac",
  "margarin",
  "jaja",
  "kruh",
  "baguette",
  "toast",
  "pecivo",
  "croissant",
  "kroasan",
  "krafna",
  "burek",
  "pita ",
  "donut",
  "muffin",
  "dvopek",
  "tjestenina",
  "njoki",
  "lasagne",
  "mlinci",
  "riza",
  "brasno",
  "secer",
  "sol ",
  " sol",
  "papar",
  "zacin",
  "ulje",
  "ocat",
  "kecap",
  "ketchup",
  "senf",
  "majoneza",
  "pesto",
  "umak",
  "preljev",
  "ajvar",
  "namaz",
  "hummus",
  "dzem",
  "kompot",
  "med ",
  " med",
  "puding",
  "cokolada",
  "praline",
  "keks",
  "kreker",
  "vafel",
  "vafl",
  "biskvit",
  "napolitanke",
  "bombon",
  "lizalica",
  "cips",
  "flips",
  "snack",
  "kokice",
  "sladoled",
  "kolac",
  "torta",
  "strudla",
  "desert",
  "kasica",
  "kasa ",
  "muesli",
  "musli",
  "pahuljice",
  "zobena",
  "protein",
  "kava",
  "cappuccino",
  "caj ",
  " caj",
  "sok ",
  " sok",
  "nektar",
  "smoothie",
  "napitak",
  "pice",
  "voda",
  "mineralna",
  "pivo",
  "cider",
  "vino",
  "pjenusac",
  "prosecco",
  "rakija",
  "pelinkovac",
  "liker",
  "gin ",
  "vodka",
  "whiskey",
  "whisky",
  "viski",
  "rum ",
  "tequila",
  "cocktail",
  "sirup",
  "meso",
  "piletina",
  "pileci",
  "pileca",
  "svinjetina",
  "svinjski",
  "junetina",
  "govedina",
  "puretina",
  "teletina",
  "janjetina",
  "mljeveno",
  "sunka",
  "prsut",
  "panceta",
  "slanina",
  "budola",
  "kobasica",
  "kulen",
  "hrenovke",
  "kranjska",
  "salama",
  "mortadela",
  "pasteta",
  "tuna",
  "tunj",
  "losos",
  "sardina",
  "srdela",
  "bakalar",
  "brancin",
  "orada",
  "lignja",
  "sipa",
  "oslic",
  "skusa",
  "filet",
  "file ",
  "juha",
  "pizza",
  "sendvic",
  "hamburger",
  "tortilla",
  "tortilja",
  "grissini",
  "stapici",
  "tijesto",
  "lisnato",
  "rajcica",
  "paprika",
  "krumpir",
  "pommes",
  "pire",
  "kupus",
  "mrkva",
  "luk ",
  " luk",
  "krastavac",
  "cikla",
  "sampinjoni",
  "grah",
  "grasak",
  "slanutak",
  "leca",
  "mahuna",
  "kukuruz",
  "soja",
  "masline",
  "salata",
  "jabuka",
  "banana",
  "banane",
  "kruska",
  "limun",
  "ananas",
  "kokos",
  "badem",
  "orah",
  "kikiriki",
  "kvasac",
  // higijena / kozmetika
  "sampon",
  "sapun",
  "losion",
  "pasta za zube",
  "zubna pasta",
  "zubna",
  "cetkica",
  "konac za zube",
  "deodorant",
  "antiperspirant",
  "pjena za brijanje",
  "gel za tusiranje",
  "tusiranje",
  "kupka",
  "krema",
  "maskara",
  "ruž",
  "ruz ",
  "lak za nokte",
  "vata",
  "ulosci",
  "tampone",
  "pelene",
  "maramice",
  "salvete",
  "papir",
  "ubrusi",
  "ubrus",
  "toaletni",
  "wc papir",
  "parodontax",
  "colgate",
  "oral b",
  "dontodent",
  "nivea",
  "balea",
  "garnier",
  "loreal",
  "gillette",
  "head shoulders",
  "palmolive",
  "neutrogena",
  // deterdženti / čišćenje
  "deterdzent",
  "omeksivac",
  "tablete za pranje",
  "kapsule za pranje",
  "pranje rublja",
  "pranje posuda",
  "za posude",
  "za posuda",
  "sudoper",
  "sredstvo za",
  "cistac",
  "ciscenje",
  "ociscivac",
  "dezinfekcij",
  "bijelilo",
  "varikina",
  "wc gel",
  "osvjezivac",
  "ariel",
  "persil",
  "lenor",
  "fairy",
  "finish",
  "domestos",
  "bref",
  "vileda",
  "frosch",
  "denkmit",
  "sidolin",
  "mr proper",
  "mr muscle",
  "wc ente",
  "wc net",
  "air wick",
  "glade",
  "spuzva",
  "spuzve",
  "krpa",
  "krpe",
  "rukavice za",
  "smece",
  "vrece za smece",
  "kese za smece",
];

/** Robne marke deterdženta / higijene — match kao cijela riječ. */
const EVERYDAY_BRAND_WORDS = new Set(["jar", "cif", "ajax", "vanish", "calgon"]);

function haystackHasKeyword(hay, keyword) {
  const k = String(keyword || "").trim();
  if (!k) return false;
  if (k.includes(" ")) return hay.includes(k);
  // riječ ili prefiks (bozicn → bozicni)
  const re = new RegExp(`(?:^|\\s)${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
  return re.test(hay);
}

/**
 * Je li naziv „svakodnevna” roba (hrana/piće/higijena/čišćenje)?
 * Ostalo (dekoracija, tekstil, aparati…) → false. Nepoznato → false.
 * @param {string} name
 * @returns {boolean}
 */
export function isEverydayItem(name) {
  const norm = normalizeEverydayName(name);
  if (norm.length < 2) return false;
  const hay = ` ${norm} `;
  for (const kw of OTHER_KEYWORDS) {
    if (haystackHasKeyword(hay, kw)) return false;
  }
  for (const kw of EVERYDAY_KEYWORDS) {
    if (haystackHasKeyword(hay, kw)) return true;
  }
  const tokens = norm.split(" ").filter(Boolean);
  for (const t of tokens) {
    if (EVERYDAY_BRAND_WORDS.has(t)) return true;
  }
  return false;
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
 * Skup: 15–50% + foto, sort po popustu desc, prvih 600.
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
 * Prvo svakodnevno; u 10 pickova ≥7 everyday i ≤3 ostalo (ako everyday nedostaje, dopuni iz ostalog).
 * @param {Array<object>} products
 * @param {{
 *   now?: Date,
 *   limit?: number,
 *   storeFilterActive?: boolean,
 *   maxPerStore?: number,
 *   minEveryday?: number,
 *   maxOther?: number,
 * }} [opts]
 * @returns {object[]}
 */
export function selectDailyPicks(products, opts = {}) {
  const now = opts.now ?? new Date();
  const limit = opts.limit ?? DAILY_PICKS_LIMIT;
  const storeFilterActive = Boolean(opts.storeFilterActive);
  const maxPerStore = opts.maxPerStore ?? DAILY_MAX_PER_STORE;
  const minEveryday = opts.minEveryday ?? DAILY_MIN_EVERYDAY;
  const maxOther = opts.maxOther ?? DAILY_MAX_OTHER;
  const dayKey = calendarDayKey(now);
  if (!dayKey) return [];

  const pool = buildDailyCandidatePool(products, opts);
  if (pool.length === 0) return [];

  const scored = pool.map((p) => {
    const pid = productIdentity(p);
    const score = hashString(`${dayKey}:${pid}`);
    return {
      p,
      pid,
      score,
      nk: nameKey(p.name),
      sk: storeKey(p),
      everyday: isEverydayItem(p.name),
    };
  });
  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    return a.pid.localeCompare(b.pid);
  });

  const picked = [];
  const seenProduct = new Set();
  const seenNameKey = new Set();
  const storeCounts = new Map();
  let everydayCount = 0;
  let otherCount = 0;

  function canTake(row) {
    if (!row.pid || seenProduct.has(row.pid)) return false;
    if (row.nk && seenNameKey.has(row.nk)) return false;
    if (!storeFilterActive) {
      const c = storeCounts.get(row.sk) || 0;
      if (c >= maxPerStore) return false;
    }
    return true;
  }

  function take(row) {
    picked.push(row.p);
    seenProduct.add(row.pid);
    if (row.nk) seenNameKey.add(row.nk);
    if (!storeFilterActive) {
      storeCounts.set(row.sk, (storeCounts.get(row.sk) || 0) + 1);
    }
    if (row.everyday) everydayCount += 1;
    else otherCount += 1;
  }

  const everydayRows = scored.filter((r) => r.everyday);
  const otherRows = scored.filter((r) => !r.everyday);

  for (const row of everydayRows) {
    if (picked.length >= limit) break;
    if (!canTake(row)) continue;
    take(row);
  }

  const otherCap =
    everydayCount >= minEveryday
      ? Math.min(maxOther, limit - picked.length)
      : limit - picked.length;

  let addedOther = 0;
  for (const row of otherRows) {
    if (picked.length >= limit) break;
    if (addedOther >= otherCap) break;
    if (!canTake(row)) continue;
    take(row);
    addedOther += 1;
  }

  // Ako još ima mjesta i everyday je ostao (preskočen zbog capa), pokušaj opet
  if (picked.length < limit) {
    for (const row of everydayRows) {
      if (picked.length >= limit) break;
      if (!canTake(row)) continue;
      take(row);
    }
  }

  void otherCount;
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
