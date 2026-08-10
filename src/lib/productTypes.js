/**
 * Tipovi proizvoda za €/kg usporedbu (prva riječ naziva → tip).
 * Izvor: top prve riječi iz regular_prices.name; brendovi/šum izbačeni.
 *
 * matches: UPPER varijante (parser radi upper(trim)).
 */

/**
 * @typedef {{ key: string, label: string, matches: string[] }} ProductType
 */

/** @type {ProductType[]} */
export const PRODUCT_TYPES = [
  { key: "vino", label: "Vino", matches: ["VINO", "VINA"] },
  { key: "sir", label: "Sir", matches: ["SIR", "MOZZARELLA", "ENCIAN"] },
  { key: "kruh", label: "Kruh", matches: ["KRUH", "BAGUETTE", "TOAST", "DVOPEK"] },
  { key: "keks", label: "Keks", matches: ["KEKS", "KEKSI", "KREKER", "KREKERI", "VAFEL", "VAFL", "BISKVIT", "NAPOLITANKE"] },
  { key: "pivo", label: "Pivo", matches: ["PIVO", "CIDER"] },
  { key: "sok", label: "Sok", matches: ["SOK", "NEKTAR", "SMOOTHIE"] },
  { key: "kava", label: "Kava", matches: ["KAVA", "CAPPUCCINO", "KAKAO"] },
  { key: "napitak", label: "Napitak", matches: ["NAPITAK", "GAZ.PIĆE", "GAZIRANO"] },
  { key: "caj", label: "Čaj", matches: ["ČAJ", "CAJ"] },
  { key: "sladoled", label: "Sladoled", matches: ["SLADOLED"] },
  { key: "umak", label: "Umak", matches: ["UMAK", "KEČAP", "KETCHUP", "SENF", "MAJONEZA", "PESTO", "PRELJEV", "DRESSING"] },
  { key: "liker", label: "Liker", matches: ["LIKER"] },
  { key: "zacin", label: "Začin", matches: ["ZAČIN", "ZACIN", "PAPAR", "SOL", "AROMA"] },
  { key: "pecivo", label: "Pecivo", matches: ["PECIVO", "CROISSANT", "KROASAN", "KRAFNA", "BUREK", "PITA", "DONUT", "MUFFIN", "PANETTONE"] },
  { key: "voda", label: "Voda", matches: ["VODA"] },
  { key: "cokolada", label: "Čokolada", matches: ["ČOKOLADA", "COKOLADA", "ČOK.", "ČOK", "PRALINE", "ČOKOLADNI", "ČOKOLADNA", "COKOLADNA", "ČOKOLADNE", "ČOKOL"] },
  { key: "jogurt", label: "Jogurt", matches: ["JOGURT", "KEFIR"] },
  { key: "ulje", label: "Ulje", matches: ["ULJE"] },
  { key: "namaz", label: "Namaz", matches: ["NAMAZ", "HUMMUS"] },
  { key: "mlijeko", label: "Mlijeko", matches: ["MLIJEKO"] },
  { key: "cips", label: "Čips", matches: ["ČIPS", "CIPS", "FLIPS", "SNACK", "KOKICE"] },
  { key: "bombon", label: "Bombon", matches: ["BOMBON", "BOMBONI", "BOM.", "BOMB.", "BOMBONJERA", "BOMBONIJERA", "LIZALICA"] },
  { key: "juha", label: "Juha", matches: ["JUHA"] },
  { key: "pasteta", label: "Pašteta", matches: ["PAŠTETA", "PASTETA"] },
  { key: "tuna", label: "Tuna", matches: ["TUNA", "TUNJ"] },
  { key: "tjestenina", label: "Tjestenina", matches: ["TJESTENINA", "TJ.", "TJEST", "NJOKI", "LASAGNE", "MLINCI"] },
  { key: "kobasica", label: "Kobasica", matches: ["KOBASICA", "KULEN", "HRENOVKE", "KRANJSKA"] },
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
];

/** Map: UPPER match token → product type key */
const MATCH_TO_KEY = new Map();
for (const t of PRODUCT_TYPES) {
  for (const m of t.matches) {
    MATCH_TO_KEY.set(String(m).toUpperCase(), t.key);
  }
}

const KEY_TO_TYPE = new Map(PRODUCT_TYPES.map((t) => [t.key, t]));

/**
 * @param {string | null | undefined} name
 * @returns {string | null} product_type key
 */
export function matchProductType(name) {
  const first = String(name || "")
    .trim()
    .split(/\s+/)[0];
  if (!first) return null;
  return MATCH_TO_KEY.get(first.toUpperCase()) || null;
}

/**
 * @param {string | null | undefined} key
 * @returns {ProductType | null}
 */
export function getProductType(key) {
  if (!key) return null;
  return KEY_TO_TYPE.get(key) || null;
}
