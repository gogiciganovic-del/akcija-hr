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
export const DAILY_MIN_FOOD = 5;
export const DAILY_MAX_HYGIENE = 3;
export const DAILY_MAX_OTHER = 2;
/** @deprecated koristi DAILY_MIN_FOOD; zadržano za kompatibilnost. */
export const DAILY_MIN_EVERYDAY = 7;
export const HOT_MAX_DISCOUNT = 70;
export const HOT_WINDOW = 12;
export const HOT_MAX_PER_NAME_KEY = 3;

export const ITEM_CLASS_FOOD = "hrana";
export const ITEM_CLASS_HYGIENE = "higijena";
export const ITEM_CLASS_OTHER = "ostalo";

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
  "ritter sport",
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
    // makni suffix scrapera da marke/trgovine na kraju ne utječu
    .replace(/\s+akcija\s+u\s+trgovini\s+.+$/i, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * ISKLJUČIVANJA — kuhinjski pribor/aparati/posuđe/alati/odjeća/igračke/ukrasi/parfemi.
 * Pobjeđuju pogodak na hrani/higijeni.
 */
const EXCLUDE_KEYWORDS = [
  "toaletna voda",
  "parfem",
  "parfema",
  "parfemska",
  "eau de",
  "edt",
  "edp",
  "hrana za pse",
  "hrana za macke",
  "za pse",
  "za macke",
  "poslastice za pse",
  "pijesak za macke",
  "pedigree",
  "whiskas",
  "friskies",
  "felix",
  "cesar",
  "migliorcane",
  "dein bestes",
  "pribor za",
  "set pribora",
  "kuhalo",
  "boca za",
  "staklena boca",
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
  "kuglica",
  "kuglice",
  "svijece",
  "svijeca",
  "svjetiljk",
  "lampion",
  "difuzor",
  "posteljin",
  "jastucnic",
  "jastuk",
  "pokriva",
  "prekrivac",
  "nadmadrac",
  "deka",
  "cebe",
  "rucnik",
  "peskir",
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
  "puzzle",
  "sjeckalic",
  "sjeckalica",
  "chop chop",
  "delimano",
  "mikser",
  "blender",
  "toster",
  "pegela",
  "usisivac",
  "friteza",
  "pecnic",
  "tiganj",
  "tave",
  "tanjur",
  "tanjiri",
  "salice",
  "salica",
  "casa",
  "case",
  "tognana",
  "pribor za jelo",
  "vilica",
  "noz za",
  "lonac",
  "lonci",
  "posuda za",
  "set posuda",
  "posude za",
  "valjak",
  "kalup",
  "fondue",
  "aparat",
  "aparati",
  "set za",
  "ultrazvucni",
  "parni cistac",
  "parna postaja",
  "cistac mrlja",
  "tefal",
  "silvercrest",
  "philips",
  "rostilj",
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
  "monitor",
  "tipkovnic",
  "stolac",
  "stolovi",
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
  "bicikl",
  "romobil",
  "kaciga",
  "etažer",
  "etazer",
  "kutije za odlaganje",
  "aranžiranje",
  "aranziranje",
  "trenirka",
  "ipl ",
  "lumea",
];

/** Hrana i piće — vrste. */
const FOOD_KEYWORDS = [
  "mlijeko",
  "jogurt",
  "kefir",
  "vrhnje",
  "slag",
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
  "muesli",
  "musli",
  "pahuljice",
  "loptice",
  "zitne",
  "zitarice",
  "zobena",
  "protein",
  "kava",
  "cappuccino",
  "nektar",
  "smoothie",
  "napitak",
  "mineralna",
  "pivo",
  "cider",
  "vino",
  "pjenusac",
  "prosecco",
  "rakija",
  "pelinkovac",
  "liker",
  "vodka",
  "whiskey",
  "whisky",
  "viski",
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
  "pureca",
  "pureci",
  "teletina",
  "janjetina",
  "mljeveno",
  "pecenica",
  "avokado",
  "sirutka",
  "cola",
  "klementina",
  "mandarina",
  "naranca",
  "rizoto",
  "puretin",
  "klipic",
  "kolutici",
  "wafer",
  "biscotti",
  "digestive",
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
  "juha",
  "pizza",
  "sendvic",
  "hamburger",
  "tortilla",
  "tortilja",
  "grissini",
  "lisnato",
  "kakao",
  "dessert",
  "cordon",
  "nugget",
  "nuggets",
  "medaljon",
  "medaljoni",
  "rajcica",
  "paprika",
  "krumpir",
  "pommes",
  "pire",
  "kupus",
  "mrkva",
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
  "cvarci",
  "pekmez",
  "rezanci",
  "gljive",
  "pistacio",
  "slatkis",
  "slatkisi",
  "tingul",
  "rasjek",
  "medenjaci",
  "medenjak",
  "sushi",
  "sauvignon",
  "muskat",
  "grasevina",
  "chardonnay",
  "merlot",
  "cabernet",
  "pite",
  "savijace",
];

/** Hrana — riječi s oprezom (kratke / česte). */
const FOOD_CAREFUL = [
  "sir",
  "sol",
  "med",
  "caj",
  "sok",
  "pice",
  "rum",
  "gin",
  "file",
  "pita",
  "kasa",
  "luk",
  "tijesto",
];

/** Piće „voda” samo s kontekstom (ne micelarna / kuhalo). */
const WATER_CONTEXT = ["mineralna", "gazirana", "negazirana", "negaz", "izvorska", "stolisna"];

/** Marke hrane (cijela riječ). */
const FOOD_BRANDS = new Set([
  "nesquik",
  "nestle",
  "nestlé",
  "podravka",
  "vindija",
  "dukat",
  "zvijezda",
  "barilla",
  "milka",
  "lindt",
  "pivac",
  "gavrilovic",
  "president",
  "alpro",
  "dolcela",
  "marodi",
  "cedevita",
  "jamnica",
  "cockta",
  "karlovačko",
  "karlovacko",
  "ozujsko",
  "pan",
  "vegeta",
  "eva",
  "toblerone",
  "kandit",
  "kraś",
  "kras",
  "financ",
  "zdenka",
  "sirela",
  "dukat",
  "meggle",
  "actuamel",
  "activia",
  "oho",
  "kikkoman",
  "goldfish",
  "storck",
  "toffifee",
  "merci",
  "bottega",
  "deluxe",
  "golden",
  "land",
  "argeta",
  "gavrilović",
  "haribo",
  "cockta",
  "lavazza",
  "barcaffe",
  "chio",
  "ledo",
  "ehrmann",
  "bellarom",
  "lay",
  "lays",
]);

/** Višerječne marke hrane. */
const FOOD_MULTI = ["rio mare", "ritter sport", "dr oetker", "coca cola", "red bull"];

/** Higijena / kozmetika / deterdženti / čišćenje. */
const HYGIENE_KEYWORDS = [
  "sampon",
  "sapun",
  "losion",
  "pasta za zube",
  "zubna pasta",
  "zubna",
  "cetkica",
  "konac za zube",
  "deodorant",
  "dezodorans",
  "antiperspirant",
  "pjena za brijanje",
  "gel za tusiranje",
  "tusiranje",
  "kupka",
  "krema za",
  "dnevna krema",
  "nocna krema",
  "maskara",
  "lak za nokte",
  "lak za kosu",
  "pjena za kosu",
  "nadlak",
  "uv gel",
  "vata",
  "mirisni stapici",
  "osvjezivac prostora",
  "maska za kosu",
  "ulosci",
  "tampone",
  "pelene",
  "maramice",
  "salvete",
  "ubrusi",
  "ubrus",
  "toaletni",
  "wc papir",
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
  "ciscenje",
  "ociscivac",
  "dezinfekcij",
  "bijelilo",
  "varikina",
  "wc gel",
  "osvjezivac",
  "spuzva",
  "spuzve",
  "krpa",
  "krpe",
  "rukavice za",
  "smece",
  "vrece za smece",
  "kese za smece",
  "sanitar",
  "balzam",
  "miris za perilicu",
  "odmascivac",
  "sredstvo za ciscenje",
  "kreme",
];

/** Higijena — oprezne riječi. */
const HYGIENE_CAREFUL = ["papir", "cistac", "ruz"];

/** Marke higijene. */
const HYGIENE_BRANDS = new Set([
  "fa",
  "rimmel",
  "nivea",
  "dove",
  "colgate",
  "schauma",
  "gillette",
  "loreal",
  "garnier",
  "balea",
  "dontodent",
  "parodontax",
  "palmolive",
  "neutrogena",
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
  "jar",
  "cif",
  "ajax",
  "vanish",
  "calgon",
  "herbal",
  "essences",
  "head",
  "shoulders",
  "oral",
  "ambi",
  "glade",
  "dexal",
  "nila",
  "vesh",
  "weisser",
  "riese",
  "blista",
  "perfex",
  "afrodita",
  "w5",
  "meri",
  "merino",
  "olival",
  "dove",
  "silan",
  "perwoll",
  "rexona",
  "batiste",
  "ornel",
  "libresse",
  "eveline",
  "ziaja",
  "malizia",
  "lactovit",
  "taft",
]);

const HYGIENE_MULTI = [
  "head shoulders",
  "oral b",
  "mr proper",
  "mr muscle",
  "wc ente",
  "wc net",
  "air wick",
  "herbal essences",
  "l oreal",
];

function haystackHasKeyword(hay, keyword) {
  const k = String(keyword || "").trim();
  if (!k) return false;
  if (k.includes(" ")) {
    return hay.includes(` ${k} `) || hay.includes(` ${k}`) || hay.includes(`${k} `);
  }
  const esc = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // točna riječ ili kratki nastavak (puretina → puretinom), min. korijen 5 znakova
  const re =
    k.length >= 5
      ? new RegExp(`(?:^|\\s)${esc}[a-z]{0,4}(?:\\s|$)`)
      : new RegExp(`(?:^|\\s)${esc}(?:\\s|$)`);
  return re.test(hay);
}

function hasCarefulWord(hay, word) {
  const re = new RegExp(`(?:^|\\s)${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|$)`);
  return re.test(hay.trim());
}

function hasBrandToken(norm, brands) {
  const tokens = norm.split(" ").filter(Boolean);
  for (const t of tokens) {
    if (brands.has(t)) return true;
  }
  return false;
}

function hasMulti(hay, list) {
  for (const m of list) {
    if (hay.includes(` ${m} `) || hay.includes(` ${m}`) || hay.startsWith(`${m} `)) return true;
  }
  return false;
}

/**
 * Klasa proizvoda po nazivu: hrana | higijena | ostalo.
 * Prioritet: isključenja → hrana → higijena → ostalo.
 * @param {string} name
 * @returns {"hrana"|"higijena"|"ostalo"}
 */
export function classifyItem(name) {
  const norm = normalizeEverydayName(name);
  if (norm.length < 2) return ITEM_CLASS_OTHER;
  const hay = ` ${norm} `;

  for (const kw of EXCLUDE_KEYWORDS) {
    if (haystackHasKeyword(hay, kw)) return ITEM_CLASS_OTHER;
  }

  // Kozmetičko „mlijeko/voda” — ne hrana
  const cosmeticFluid =
    /micelarna|za ciscenje|skidanje sminke|ciscenje lica|mlijeko za lice/.test(hay);

  if (!cosmeticFluid) {
    if (hasMulti(hay, FOOD_MULTI) || hasBrandToken(norm, FOOD_BRANDS)) {
      return ITEM_CLASS_FOOD;
    }
    for (const kw of FOOD_KEYWORDS) {
      if (haystackHasKeyword(hay, kw)) return ITEM_CLASS_FOOD;
    }
    for (const kw of FOOD_CAREFUL) {
      if (hasCarefulWord(hay, kw)) return ITEM_CLASS_FOOD;
    }
    if (hasCarefulWord(hay, "voda") && WATER_CONTEXT.some((w) => hay.includes(w))) {
      return ITEM_CLASS_FOOD;
    }
  }

  if (hasMulti(hay, HYGIENE_MULTI) || hasBrandToken(norm, HYGIENE_BRANDS)) {
    return ITEM_CLASS_HYGIENE;
  }
  if (cosmeticFluid) return ITEM_CLASS_HYGIENE;
  for (const kw of HYGIENE_KEYWORDS) {
    if (haystackHasKeyword(hay, kw)) return ITEM_CLASS_HYGIENE;
  }
  for (const kw of HYGIENE_CAREFUL) {
    if (hasCarefulWord(hay, kw)) return ITEM_CLASS_HYGIENE;
  }

  return ITEM_CLASS_OTHER;
}

/** hrana || higijena */
export function isEverydayItem(name) {
  const c = classifyItem(name);
  return c === ITEM_CLASS_FOOD || c === ITEM_CLASS_HYGIENE;
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
 * Dnevni izbor: ≥5 hrana, ≤3 higijena, ≤2 ostalo; inače dopuna redom hrana→higijena→ostalo.
 * @param {Array<object>} products
 * @param {{
 *   now?: Date,
 *   limit?: number,
 *   storeFilterActive?: boolean,
 *   maxPerStore?: number,
 *   minFood?: number,
 *   maxHygiene?: number,
 *   maxOther?: number,
 * }} [opts]
 * @returns {object[]}
 */
export function selectDailyPicks(products, opts = {}) {
  const now = opts.now ?? new Date();
  const limit = opts.limit ?? DAILY_PICKS_LIMIT;
  const storeFilterActive = Boolean(opts.storeFilterActive);
  const maxPerStore = opts.maxPerStore ?? DAILY_MAX_PER_STORE;
  const minFood = opts.minFood ?? DAILY_MIN_FOOD;
  const maxHygiene = opts.maxHygiene ?? DAILY_MAX_HYGIENE;
  const maxOther = opts.maxOther ?? DAILY_MAX_OTHER;
  const dayKey = calendarDayKey(now);
  if (!dayKey) return [];

  const pool = buildDailyCandidatePool(products, opts);
  if (pool.length === 0) return [];

  const scored = pool.map((p) => {
    const pid = productIdentity(p);
    const score = hashString(`${dayKey}:${pid}`);
    const cls = classifyItem(p.name);
    return {
      p,
      pid,
      score,
      nk: nameKey(p.name),
      sk: storeKey(p),
      cls,
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
  const counts = {
    [ITEM_CLASS_FOOD]: 0,
    [ITEM_CLASS_HYGIENE]: 0,
    [ITEM_CLASS_OTHER]: 0,
  };

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
    counts[row.cls] = (counts[row.cls] || 0) + 1;
  }

  function takeFrom(rows, maxAdd) {
    let added = 0;
    for (const row of rows) {
      if (picked.length >= limit) break;
      if (added >= maxAdd) break;
      if (!canTake(row)) continue;
      take(row);
      added += 1;
    }
  }

  const foodRows = scored.filter((r) => r.cls === ITEM_CLASS_FOOD);
  const hygieneRows = scored.filter((r) => r.cls === ITEM_CLASS_HYGIENE);
  const otherRows = scored.filter((r) => r.cls === ITEM_CLASS_OTHER);

  // 1) hrana — cilj barem minFood, smije ići do limita
  takeFrom(foodRows, limit);

  // 2) higijena — soft cap ako ima dovoljno hrane
  {
    const remaining = limit - picked.length;
    const soft =
      counts[ITEM_CLASS_FOOD] >= minFood
        ? Math.min(maxHygiene, remaining)
        : remaining;
    takeFrom(hygieneRows, soft);
  }

  // 3) ostalo — soft cap ako ima dovoljno hrane
  {
    const remaining = limit - picked.length;
    const soft =
      counts[ITEM_CLASS_FOOD] >= minFood
        ? Math.min(maxOther, remaining)
        : remaining;
    takeFrom(otherRows, soft);
  }

  // 4) dopuna redom hrana → higijena → ostalo
  if (picked.length < limit) takeFrom(foodRows, limit - picked.length);
  if (picked.length < limit) takeFrom(hygieneRows, limit - picked.length);
  if (picked.length < limit) takeFrom(otherRows, limit - picked.length);

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

  return window.concat(deferred);
}
