/**
 * Tipovi proizvoda za €/kg usporedbu (riječi iz naziva → tip).
 * matches: samo generičke riječi vrste — bez brendova.
 * matchProductType prolazi sve riječi; najduži token pobjeđuje (podtipovi).
 */

/**
 * @typedef {{ key: string, label: string, matches: string[] }} ProductType
 */

/** @type {ProductType[]} */
export const PRODUCT_TYPES = [
  { key: "vino", label: "Vino", matches: ["VINO", "VINA"] },
  { key: "sir", label: "Sir", matches: ["SIR", "MOZZARELLA"] },
  { key: "kruh", label: "Kruh", matches: ["KRUH", "BAGUETTE", "TOAST"] },
  { key: "dvopek", label: "Dvopek", matches: ["DVOPEK"] },
  { key: "keks", label: "Keks", matches: ["KEKS", "KEKSI", "KREKER", "KREKERI", "VAFEL", "VAFL", "BISKVIT", "NAPOLITANKE"] },
  { key: "pivo", label: "Pivo", matches: ["PIVO", "CIDER"] },
  { key: "sok", label: "Sok", matches: ["SOK", "NEKTAR", "SMOOTHIE"] },

  // Kava — podtipovi (duži token pobjeđuje generički KAVA)
  { key: "kava_mljevena", label: "Kava mljevena", matches: ["MLJEVENA", "MLJEVE"] },
  { key: "kava_zrno", label: "Kava u zrnu", matches: ["ZRNO", "ZRNA"] },
  { key: "kava_instant", label: "Kava instant", matches: ["INSTANT", "3U1"] },
  { key: "kava_cappuccino", label: "Cappuccino", matches: ["CAPPUCCINO"] },
  { key: "kava", label: "Kava", matches: ["KAVA"] },

  { key: "napitak", label: "Napitak", matches: ["NAPITAK", "GAZ.PIĆE", "PIĆE"] },
  { key: "caj", label: "Čaj", matches: ["ČAJ", "CAJ"] },
  { key: "sladoled", label: "Sladoled", matches: ["SLADOLED"] },
  { key: "umak", label: "Umak", matches: ["UMAK", "KEČAP", "KETCHUP", "SENF", "MAJONEZA", "PESTO", "PRELJEV", "DRESSING"] },
  { key: "liker", label: "Liker", matches: ["LIKER"] },
  { key: "zacin", label: "Začin", matches: ["ZAČIN", "ZACIN", "PAPAR", "SOL", "AROMA"] },
  { key: "pecivo", label: "Pecivo", matches: ["PECIVO", "CROISSANT", "KROASAN", "KRAFNA", "BUREK", "PITA", "DONUT", "MUFFIN", "PANETTONE"] },

  // Voda — podtipovi
  { key: "voda_gazirana", label: "Voda gazirana", matches: ["GAZIRANA", "GAZIRANE"] },
  { key: "voda_negazirana", label: "Voda negazirana", matches: ["NEGAZIRANA", "NEGAZIRANE", "NEGAZ"] },
  { key: "voda_mineralna", label: "Voda mineralna", matches: ["MINERALNA", "MINERALNE", "MINERAL"] },
  { key: "voda", label: "Voda", matches: ["VODA"] },

  { key: "cokolada", label: "Čokolada", matches: ["ČOKOLADA", "COKOLADA", "ČOK.", "ČOK", "PRALINE", "ČOKOLADNI", "ČOKOLADNA", "COKOLADNA", "ČOKOLADNE", "ČOKOL"] },
  { key: "jogurt", label: "Jogurt", matches: ["JOGURT"] },
  { key: "kefir", label: "Kefir", matches: ["KEFIR"] },

  // Ulje — podtipovi
  { key: "ulje_maslinovo", label: "Maslinovo ulje", matches: ["MASLINOVO"] },
  { key: "ulje_suncokretovo", label: "Suncokretovo ulje", matches: ["SUNCOKRETOVO", "SUNCOKRET"] },
  { key: "ulje", label: "Ulje", matches: ["ULJE", "KIKIRIKIJA", "KOKOSOVO", "BUČINO", "REPIČINO", "PALMINO"] },

  { key: "namaz", label: "Namaz", matches: ["NAMAZ", "HUMMUS"] },
  { key: "mlijeko", label: "Mlijeko", matches: ["MLIJEKO"] },
  { key: "cips", label: "Čips", matches: ["ČIPS", "CIPS", "FLIPS", "SNACK", "KOKICE"] },
  { key: "bombon", label: "Bombon", matches: ["BOMBON", "BOMBONI", "BOM.", "BOMB.", "BOMBONJERA", "BOMBONIJERA", "LIZALICA"] },
  { key: "juha", label: "Juha", matches: ["JUHA"] },
  { key: "pasteta", label: "Pašteta", matches: ["PAŠTETA", "PASTETA"] },
  { key: "tuna", label: "Tuna", matches: ["TUNA", "TUNJ"] },
  { key: "tjestenina", label: "Tjestenina", matches: ["TJESTENINA", "TJ.", "TJEST", "NJOKI", "LASAGNE", "MLINCI"] },
  { key: "kobasica", label: "Kobasica", matches: ["KOBASICA"] },
  { key: "kulen", label: "Kulen", matches: ["KULEN"] },
  { key: "hrenovke", label: "Hrenovke", matches: ["HRENOVKE"] },
  { key: "kranjska", label: "Kranjska", matches: ["KRANJSKA"] },
  { key: "gin", label: "Gin", matches: ["GIN"] },
  { key: "kolac", label: "Kolač", matches: ["KOLAČ", "TORTA", "ŠTRUDLA", "DESERT"] },
  { key: "kasica", label: "Kašica", matches: ["KAŠICA", "KASICA", "KAŠA"] },
  { key: "dzem", label: "Džem", matches: ["DŽEM", "DZEM", "KOMPOT"] },
  { key: "puding", label: "Puding", matches: ["PUDING"] },
  { key: "masline", label: "Masline", matches: ["MASLINE"] },
  { key: "salata", label: "Salata", matches: ["SALATA"] },
  { key: "sunka", label: "Šunka", matches: ["ŠUNKA", "SUNKA", "PRŠUT", "PRSUT", "PANCETA", "SLANINA", "BUĐOLA"] },
  { key: "rajcica", label: "Rajčica", matches: ["RAJČICA", "RAJCICA"] },
  { key: "rakija", label: "Rakija", matches: ["RAKIJA", "PELINKOVAC"] },
  { key: "riza", label: "Riža", matches: ["RIŽA", "RIZA"] },
  { key: "muesli", label: "Muesli", matches: ["MUESLI", "MUSLI", "PAHULJICE"] },
  { key: "grah", label: "Grah", matches: ["GRAH", "GRAŠAK", "SLANUTAK", "LEĆA", "MAHUNA"] },
  { key: "pasta", label: "Pasta", matches: ["PASTA"] },
  { key: "paprika", label: "Paprika", matches: ["PAPRIKA"] },
  { key: "vodka", label: "Vodka", matches: ["VODKA"] },
  { key: "kikiriki", label: "Kikiriki", matches: ["KIKIRIKI"] },
  { key: "sirup", label: "Sirup", matches: ["SIRUP"] },
  { key: "ocat", label: "Ocat", matches: ["OCAT"] },
  { key: "whiskey", label: "Whiskey", matches: ["WHISKEY", "WHISKY", "VISKI"] },
  { key: "med", label: "Med", matches: ["MED"] },
  { key: "salama", label: "Salama", matches: ["SALAMA", "MORTADELA"] },
  { key: "vrhnje", label: "Vrhnje", matches: ["VRHNJE", "ŠLAG"] },
  { key: "ajvar", label: "Ajvar", matches: ["AJVAR"] },
  { key: "tijesto", label: "Tijesto", matches: ["TIJESTO", "LISNATO"] },
  { key: "jaja", label: "Jaja", matches: ["JAJA"] },
  { key: "pizza", label: "Pizza", matches: ["PIZZA"] },

  // Brašno — podtipovi
  { key: "brasno_ostro", label: "Brašno oštro", matches: ["OŠTRO", "OSTRO"] },
  { key: "brasno_glatko", label: "Brašno glatko", matches: ["GLATKO"] },
  { key: "brasno", label: "Brašno", matches: ["BRAŠNO", "BRASNO"] },

  { key: "maslac", label: "Maslac", matches: ["MASLAC", "MARGARIN"] },
  { key: "jabuka", label: "Jabuka", matches: ["JABUKA"] },
  { key: "kukuruz", label: "Kukuruz", matches: ["KUKURUZ"] },
  { key: "rum", label: "Rum", matches: ["RUM"] },
  { key: "krumpir", label: "Krumpir", matches: ["KRUMPIR", "POMMES", "PIRE"] },
  { key: "secer", label: "Šećer", matches: ["ŠEĆER"] },
  { key: "pjenusac", label: "Pjenušac", matches: ["PJENUŠAC", "PJENUSAC", "PROSECCO"] },
  { key: "maramice", label: "Maramice", matches: ["MARAMICE"] },
  { key: "losos", label: "Losos", matches: ["LOSOS"] },
  { key: "sardina", label: "Sardina", matches: ["SARDINA", "SRDELA"] },
  { key: "sendvic", label: "Sendvič", matches: ["SENDVIČ"] },
  { key: "kupus", label: "Kupus", matches: ["KUPUS"] },
  { key: "bakalar", label: "Bakalar", matches: ["BAKALAR"] },
  { key: "brancin", label: "Brancin", matches: ["BRANCIN"] },
  { key: "orada", label: "Orada", matches: ["ORADA"] },
  { key: "lignja", label: "Lignja", matches: ["LIGNJA", "SIPA"] },
  { key: "oslic", label: "Oslić", matches: ["OSLIĆ"] },
  { key: "skusa", label: "Skuša", matches: ["SKUŠA"] },
  { key: "filet", label: "Filet", matches: ["FILET", "FILETI"] },
  { key: "badem", label: "Badem", matches: ["BADEM"] },
  { key: "orah", label: "Orah", matches: ["ORAH"] },
  { key: "kokos", label: "Kokos", matches: ["KOKOS"] },
  { key: "ananas", label: "Ananas", matches: ["ANANAS"] },
  { key: "kruska", label: "Kruška", matches: ["KRUŠKA"] },
  { key: "limun", label: "Limun", matches: ["LIMUN"] },
  { key: "mrkva", label: "Mrkva", matches: ["MRKVA"] },
  { key: "luk", label: "Luk", matches: ["LUK"] },
  { key: "krastavac", label: "Krastavac", matches: ["KRASTAVAC", "KRASTAVCI", "CIKLA"] },
  { key: "sampinjoni", label: "Šampinjoni", matches: ["ŠAMPINJONI"] },
  { key: "soja", label: "Soja", matches: ["SOJA"] },
  { key: "kvasac", label: "Kvasac", matches: ["KVASAC"] },
  { key: "protein", label: "Protein", matches: ["PROTEIN", "PROTEINSKI"] },
  { key: "hamburger", label: "Hamburger", matches: ["HAMBURGER"] },
  { key: "tortilla", label: "Tortilla", matches: ["TORTILLA", "TORTILJA"] },
  { key: "grissini", label: "Grissini", matches: ["GRISSINI", "ŠTAPIĆI"] },
  { key: "tequila", label: "Tequila", matches: ["TEQUILA"] },
  { key: "cocktail", label: "Cocktail", matches: ["COCKTAIL"] },
  { key: "salvete", label: "Salvete", matches: ["SALVETE"] },
  { key: "zobena", label: "Zobena", matches: ["ZOBENA"] },

  // Nedostajući iz testa košarice + kućanstvo
  { key: "banana", label: "Banana", matches: ["BANANA", "BANANE"] },
  { key: "meso_piletina", label: "Piletina", matches: ["PILETINA", "PILEĆI", "PILECI", "PILEĆA", "PILECA"] },
  { key: "meso_svinjetina", label: "Svinjetina", matches: ["SVINJETINA", "SVINJSKI", "SVINJSKA"] },
  { key: "meso_junetina", label: "Junetina", matches: ["JUNETINA", "JUNEĆI", "JUNECI", "JUNEĆA", "GOVEDINA"] },
  { key: "meso", label: "Meso", matches: ["MESO", "PURETINA", "TELETINA", "JANJETINA", "MLJEVENO"] },
  { key: "papir", label: "Papir", matches: ["PAPIR", "UBRUSI", "UBRUS"] },
  { key: "sampon", label: "Šampon", matches: ["ŠAMPON", "SAMPON"] },
  { key: "sapun", label: "Sapun", matches: ["SAPUN"] },
  { key: "losion", label: "Losjon", matches: ["LOSION", "LOSIONA"] },
  { key: "omeksivac", label: "Omekšivač", matches: ["OMEKŠIVAČ", "OMEKSIVAC"] },
  { key: "krpa", label: "Krpa", matches: ["KRPA", "KRPE"] },
];

/** Map: UPPER match token → product type key */
const MATCH_TO_KEY = new Map();
for (const t of PRODUCT_TYPES) {
  for (const m of t.matches) {
    MATCH_TO_KEY.set(String(m).toUpperCase(), t.key);
  }
}

const KEY_TO_TYPE = new Map(PRODUCT_TYPES.map((t) => [t.key, t]));

/** Brojevi i jedinice — ne koriste se za tip. */
const SKIP_TOKENS = new Set([
  "G",
  "GR",
  "GRAM",
  "GRAMA",
  "KG",
  "KILA",
  "ML",
  "MILILITAR",
  "MILILITARA",
  "L",
  "LIT",
  "LITAR",
  "LITARA",
  "LITRA",
  "LITRE",
  "CCA",
  "CA",
  "APPROX",
  "KOM",
  "KOMADA",
  "X",
]);

/**
 * Tokenizacija: sve riječi, bez brojeva i jedinica.
 * @param {string} name
 * @returns {string[]}
 */
export function tokenizeNameForType(name) {
  return String(name || "")
    .toUpperCase()
    .normalize("NFC")
    .split(/[^A-ZČĆŽŠĐ0-9.]+/u)
    .map((t) => t.replace(/^\.+|\.+$/g, ""))
    .filter((t) => {
      if (!t || t.length < 2) return false;
      if (SKIP_TOKENS.has(t)) return false;
      if (/^\d+([.,]\d+)?$/.test(t)) return false;
      return true;
    });
}

/**
 * Tip proizvoda: prolazi sve riječi; najduži match token.
 * Podtipovi (key s '_') imaju prednost nad generičkim tipom iste obitelji.
 * @param {string | null | undefined} name
 * @returns {string | null} product_type key
 */
export function matchProductType(name) {
  const tokens = tokenizeNameForType(name || "");
  let bestKey = null;
  let bestScore = -1;
  for (const token of tokens) {
    const key = MATCH_TO_KEY.get(token);
    if (!key) continue;
    const score = token.length + (key.includes("_") ? 100 : 0);
    if (score >= bestScore) {
      bestScore = score;
      bestKey = key;
    }
  }
  return bestKey;
}

/**
 * @param {string | null | undefined} key
 * @returns {ProductType | null}
 */
export function getProductType(key) {
  if (!key) return null;
  return KEY_TO_TYPE.get(key) || null;
}
