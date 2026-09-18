import { getProductType } from './productTypes.js'
import { tokenMatchesTerm } from './searchRelevance.js'

const MAX_TYPE_SUFFIX_LEN = 4

/**
 * Podudaranje riječi s tokenom tipa (korijen + padež).
 * tokenMatchesTerm pokriva SIROM→SIR; zajednički prefiks pokriva PILETINOM↔PILETINA.
 */
function typeMatchToken(word, term) {
  if (tokenMatchesTerm(word, term) || tokenMatchesTerm(term, word)) return true
  const w = String(word).toUpperCase().normalize('NFC')
  const t = String(term).toUpperCase().normalize('NFC')
  let i = 0
  while (i < w.length && i < t.length && w[i] === t[i]) i++
  if (i < 3) return false
  const suffixW = w.length - i
  const suffixT = t.length - i
  return (
    suffixW > 0 &&
    suffixW <= MAX_TYPE_SUFFIX_LEN &&
    suffixT <= MAX_TYPE_SUFFIX_LEN
  )
}

/** Prerađeni oblici — drugi cijenski razred unutar istog tipa. Marinirano ostaje OK (polusirovo). */
const PROCESSED_FORM_RE =
  /\b(medaljon\w*|paniran\w*|punjen\w*|punjena\w*|gratiniran\w*|u\s+umaku)\b/i

const MEAT_TYPE_KEYS = new Set([
  'meso_piletina',
  'meso_svinjetina',
  'meso_junetina',
])

/** Gotova jela / prerađevine — ne uspoređuj s file/mljevenim unutar mesa. */
const READY_MEAL_RE =
  /\b(paprika[sš]|ra[nž]nji[cć]|ra[nž]nji[cć]i|[čc]evap|[čc]evap[cč]i[cć]|hren(?:ovk|\.|\b)|nuget|nugget|cheeseburger|(?:ham)?burger|kobasic|\bkob\b|pa[sš]tet|lazanj|lasagn|parizer|vir[sš]l|salam(?!ur)|posebn(?!\w*\s*ponud)|mix\s+za\s+juhu)\w*/i

/** Hrana za kućne ljubimce (i kad piše piletina/govedina u nazivu). */
const PET_FOOD_RE =
  /\b(hrana\s+za\s+(ma[cč]k|ma[cč]ke|pse|pasa)|za\s+(ma[cč]k|ma[cč]ke|pse)\b|friskies|petties|whiskas|pedigree|felix|gourmet|hobby\s*dog|kitty|macke|ma[cč]ke|buddy|mg\s+mm)\b/i

/** Iznutrice — ne uspoređuj s file/prsima osim kad korisnik traži organ. Vrat = rez mesa, ne organ. */
const ORGAN_WORD_RE =
  /^(jetr\w*|sr[cč]\w*|[žz]elu\w*|bubreg\w*|bubre[žz]\w*|iznutric\w*|iznutr\w*)$/i

/**
 * Grupe reza mesa — riječi unutar grupe smatraju se istim rezom (file ≈ prsa).
 * Kobasica je već u gotovim jelima; ovdje nije uključena.
 */
const MEAT_CUT_GROUPS = [
  { id: 'file', wordRe: /^(file\w*|filet\w*|prsa\w*|prsn\w*|prsi\w*)$/i },
  { id: 'batak', wordRe: /^(zabatak\w*|batak\w*|batci\w*)$/i },
  { id: 'krilca', wordRe: /^(krilc\w*|kril\w*)$/i },
  { id: 'but', wordRe: /^but\w*$/i },
  { id: 'vrat', wordRe: /^vrat\w*$/i },
  { id: 'rebra', wordRe: /^rebr\w*$/i },
  { id: 'koljenica', wordRe: /^koljen\w*$/i },
  { id: 'mljeven', wordRe: /^mljeven\w*$/i },
  { id: 'odresci', wordRe: /^odresc\w*$/i },
]

/** Mast / salo — nije mljeveno niti rez mesa za kuhanje. */
const MEAT_FAT_RE = /\b(mast|salo)\b/i
const MEAT_FAT_FALSE_RE = /\bmastil/i

/**
 * @param {string | null | undefined} name
 */
export function isMeatFatProduct(name) {
  const n = String(name || '')
  if (MEAT_FAT_FALSE_RE.test(n)) return false
  return MEAT_FAT_RE.test(n)
}

/**
 * @param {string | null | undefined} name
 */
export function isOdresciProduct(name) {
  return /\bodresc/i.test(String(name || ''))
}

/**
 * Query eksplicitno traži mljeveno meso.
 * @param {string | null | undefined} name
 */
export function queryWantsGroundMeat(name) {
  return meatCutIdsInName(name).has('mljeven')
}

/**
 * Query traži čisti file/prsa (ne mješavinu).
 * @param {string | null | undefined} name
 */
export function queryWantsCleanFile(name) {
  const cuts = meatCutIdsInName(name)
  if (!cuts.has('file')) return false
  return !isMixFileProduct(name)
}

/**
 * Mješavina (npr. „mix file“, „mix mini“) — nije čisti file/prsa.
 * @param {string | null | undefined} name
 */
export function isMixFileProduct(name) {
  const n = String(name || '')
  return /\bmix\b/i.test(n) || /\bmije[sš](an|ovin)/i.test(n)
}

function nameWordsUpper(name) {
  return String(name || '')
    .toUpperCase()
    .normalize('NFC')
    .split(/[^A-ZČĆŽŠĐ]+/u)
    .filter(Boolean)
}

function isMeatType(typeKey) {
  return MEAT_TYPE_KEYS.has(typeKey)
}

/**
 * Gotovo jelo / prerađevina (ne sirovo meso).
 * „Svinjetina za gulaš“ = sirovi rez, ne jelo — ostaje dopušteno.
 * @param {string | null | undefined} name
 */
export function isReadyMealOrMeatProduct(name) {
  const n = String(name || '')
  if (/\bza\s+gula[sš]\b/i.test(n)) return false
  if (/\bgula[sš]\b/i.test(n)) return true
  return READY_MEAL_RE.test(n)
}

/**
 * @param {string | null | undefined} name
 */
export function isPetFood(name) {
  const n = String(name || '')
  if (PET_FOOD_RE.test(n)) return true
  if (/\b(mp|mm)\s+(piletina|svinjetina|govedina)\b/i.test(n)) return true
  if (/\b(ze[cč]etin|zecetin)\b/i.test(n) && /\b(piletina|pile[cć]i)\b/i.test(n)) return true
  if (/\bfriends\b/i.test(n) && /\b(hrana|za\s+pse|za\s+ma[cč]k|govedina|jetra)\b/i.test(n)) {
    return true
  }
  return isPorridgeOrBabyOrPetFood(name)
}

/**
 * Iznutrice / organi (jetra, srce, želudac, bubreg…).
 * @param {string | null | undefined} name
 */
export function isOrganProduct(name) {
  const words = nameWordsUpper(name)
  return words.some((w) => ORGAN_WORD_RE.test(w))
}

/**
 * ID-jevi grupa reza mesa u nazivu (prazno = nema eksplicitnog reza).
 * @param {string | null | undefined} name
 * @returns {Set<string>}
 */
export function meatCutIdsInName(name) {
  const ids = new Set()
  for (const word of nameWordsUpper(name)) {
    for (const g of MEAT_CUT_GROUPS) {
      if (g.wordRe.test(word)) ids.add(g.id)
    }
  }
  return ids
}

/**
 * Kandidat dijeli rez s queryjem (ili query nema rez).
 * @param {string | null | undefined} queryName
 * @param {string | null | undefined} candidateName
 */
export function meatCutMatchesQuery(queryName, candidateName) {
  const queryCuts = meatCutIdsInName(queryName)
  if (!queryCuts.size) return true
  const candCuts = meatCutIdsInName(candidateName)
  for (const id of queryCuts) {
    if (candCuts.has(id)) return true
  }
  return false
}

/**
 * Suzi skup kandidata na isti rez; ako nema podudarnih, vrati original.
 * @template T
 * @param {T[]} candidates
 * @param {string | null | undefined} queryName
 * @param {(item: T) => string | null | undefined} getName
 * @returns {T[]}
 */
export function preferMeatCutCandidates(candidates, queryName, getName) {
  const queryCuts = meatCutIdsInName(queryName)
  if (!queryCuts.size || !candidates.length) return candidates
  const matched = candidates.filter((c) => meatCutMatchesQuery(queryName, getName(c)))
  if (matched.length) return matched

  // Mljeveno: nema drugog mljevenog — fallback na druge rezove, ne mast/odreske
  if (queryCuts.has('mljeven')) {
    const fallback = candidates.filter((c) => {
      const n = getName(c) || ''
      if (isMeatFatProduct(n)) return false
      if (isOdresciProduct(n)) return false
      return true
    })
    return fallback.length ? fallback : candidates.filter((c) => !isMeatFatProduct(getName(c)))
  }

  return candidates
}

/**
 * @param {string | null | undefined} name
 */
export function hasProcessedForm(name) {
  return PROCESSED_FORM_RE.test(String(name || ''))
}

/**
 * Riječ tipa odmah iza „sa“ / „s“ = sastojak, ne vrsta proizvoda.
 * Koristi isto podudaranje kao rječnik (korijen + nastavak), ne točan oblik.
 * @param {string | null | undefined} name
 * @param {string} typeKey
 */
export function isTypeWordIngredient(name, typeKey) {
  const typeMeta = getProductType(typeKey)
  if (!typeMeta) return false
  const matchTokens = (typeMeta.matches || []).map((m) => String(m).toUpperCase())
  const words = String(name || '')
    .toUpperCase()
    .normalize('NFC')
    .split(/[^A-ZČĆŽŠĐ]+/u)
    .filter(Boolean)
  for (let i = 1; i < words.length; i++) {
    const prev = words[i - 1]
    if (prev !== 'SA' && prev !== 'S') continue
    const word = words[i]
    if (matchTokens.some((m) => typeMatchToken(word, m))) return true
  }
  return false
}

/** Kaša / dječja hrana / hrana za ljubimce — nije meso, čak i kad piše PILETINA. */
const NOT_MEAT_TOKENS = new Set(['KAŠA', 'KAŠICA', 'KASICA', 'KAŠ', 'HIPP', 'WHISKAS'])

/** Prepelja jaja — nisu kokošja. */
const QUAIL_EGG_RE = /\bprepel/i

export function isChocolateOrFestiveEggProduct(name) {
  const n = String(name || '')
  if (!/jaj/i.test(n)) return false
  const words = nameWordsUpper(name)
  if (words.some((w) => /^SVJE/.test(w))) return false
  if (
    words.some((w) =>
      /^(COK|ČOK|COKO|ČOKO|COKOLAD|ČOKOLAD|USKRS|USKRŠ|USKRSN|BUNNY|MILKA|HAPPY|MARCIPAN|PRELJEV|KARAMEL|VOĆNIM|VOCNIM)/.test(
        w
      )
    )
  ) {
    return true
  }
  if (
    words.includes('MINI') &&
    words.some((w) => /^JAJ/.test(w)) &&
    !words.some((w) => /^SVJE/.test(w))
  ) {
    return true
  }
  if (/\bvo[cć]nim\s+preljevom\b/i.test(n)) return true
  if (/\bhappy\s*eggs\b/i.test(n)) return true
  return false
}
/** Smrznuti pomfrit / prerađeni krumpir — nije sirovi krumpir. */
const PROCESSED_POTATO_RE =
  /\b(pommes|pomfrit|frites|predpr[žz]|kroketi|valoviti\s+pommes)\b/i

/** Kokice / grickalice s okusom maslaca — nije maslac. */
const POPCORN_RE = /\b(?:kokic|popcorn|smokic|flips)/i

/** Kikiriki namaz (uklj. kraticu kik. npr. Loacker, i KIKIRI). */
const PEANUT_MASLAC_RE =
  /kikiri|kik\.|peanut|ara[sš]id/i

/** Kozmetika / njega (maslac za tijelo, usne, dren…). Ne hvata SPAR (\bspa\b). */
const MASLAC_COSMETIC_RE =
  /(?:za\s+(?:tijelo|tij\.|usne|usna|ruke|lice|tamnjen)|maslac\s+za\s+(?:tij|usn|ruk|lic|tamn)|\btij\b|\bdren\b|deodorant|njeg[aeu]\s+ko[zs]e|body\s*(?:butter|hug)|sol\s+de\s+janeiro|\bspa\b|afrodita|nivea|garnier|karite|shea|\bbalm\b|maska\s+za\s+kos|tamnjen|divlji\s+cvit|\bkrema\b|\bcream\b)/i

/** Aromatizirani maslac (začinsko bilje / trio). Slani / morska sol nisu ovdje. */
const FLAVORED_MASLAC_RE =
  /za[cč]in\.?\s*bilj|bilj.*za[cč]in|za[cč]insk|\bza[cč]in|\bzacin|trio\s+za[cč]in|\btrio\b/i

/** Orašasti namaz — nije kikiriki (taj je PEANUT_MASLAC_RE). */
const ORASASTI_MASLAC_RE =
  /\b(badem|lje[sš]njak|pistac|indijsk|ora[sš]ast|ora[sš][cč]|cashew|almond|hazelnut)/i

const GHEE_MASLAC_RE = /\bghee\b/i

/** Maslac kao sastojak (keks, pecivo, čips) — nije maslac. */
const MASLAC_INGREDIENT_RE =
  /\b(keks|madeleine|baklava|kroas|cips|vafl)/i
const MASLAC_TOAST_RE = /\b(tost|toast)\b/i

/** Punjena / lasagne / gotova jela / juha — nije suha tjestenina. Njoki je zasebna obitelj. */
const STUFFED_PASTA_RE = /\bpunjen/i
const GNOCCHI_RE = /\b(?:njok|gnocch)/i
const LASAGNE_MEAL_RE = /\blasagn/i
const READY_PASTA_MEAL_RE = /\bgotov/i
const PASTA_SOUP_RE = /\bjuha\b.*\btjest|\btjest.*\bjuha\b/i

/**
 * Oblici suhe tjestenine — mlinci su zasebna grupa (drugačiji rez/pakiranje).
 * Kad query eksplicitno traži oblik, preferiraj isti prije €/kg rangiranja.
 */
const PASTA_SHAPE_GROUPS = [
  { id: 'mlinci', wordRe: /^mlinc\w*$/i },
  { id: 'spaghetti', wordRe: /^spag\w*$/i },
  { id: 'spirali', wordRe: /^spir\w*$/i },
  { id: 'fusilli', wordRe: /^fusill\w*$/i },
  { id: 'penne', wordRe: /^penn\w*$/i },
  { id: 'farfalle', wordRe: /^farf\w*$/i },
  { id: 'rigatoni', wordRe: /^rigat\w*$/i },
  { id: 'tagliatelle', wordRe: /^tagliat\w*$/i },
  { id: 'macaroni', wordRe: /^(makaron\w*|macaron\w*)$/i },
  { id: 'rezanci', wordRe: /^rezanc\w*$/i },
  { id: 'bavette', wordRe: /^bavett\w*$/i },
  { id: 'stelle', wordRe: /^stell\w*$/i },
]

function pastaShapeWord(word) {
  return String(word)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

/**
 * @param {string | null | undefined} name
 */
export function isPopcornProduct(name) {
  return POPCORN_RE.test(String(name || ''))
}

/**
 * @param {string | null | undefined} name
 */
export function isPeanutMaslacProduct(name) {
  return PEANUT_MASLAC_RE.test(String(name || ''))
}

/**
 * @param {string | null | undefined} name
 */
export function isMaslacCosmeticProduct(name) {
  const n = String(name || '')
  if (GHEE_MASLAC_RE.test(n)) return false
  if (MASLAC_COSMETIC_RE.test(n)) return true
  // ml bez g i bez % mm / m.m. — kozmetika; mliječni maslac je u g
  if (
    /maslac/i.test(n) &&
    /\b\d+\s*ml\b/i.test(n) &&
    !/\b\d+([.,]\d+)?\s*g\b/i.test(n) &&
    !/\bmm\b/i.test(n) &&
    !/\bm\.m/i.test(n)
  ) {
    return true
  }
  return false
}

/**
 * @param {string | null | undefined} name
 */
export function isFlavoredHerbMaslacProduct(name) {
  return FLAVORED_MASLAC_RE.test(String(name || ''))
}

/**
 * Keks / pecivo / čips gdje je maslac sastojak, ne proizvod.
 * @param {string | null | undefined} name
 */
export function isMaslacIngredientProduct(name) {
  const n = String(name || '')
  if (MASLAC_INGREDIENT_RE.test(n)) return true
  if (MASLAC_TOAST_RE.test(n) && /maslac/i.test(n)) return true
  return false
}

/**
 * Obitelj unutar tipa maslac: kikiriki | orasasti | ghee | aromatizirani | mlijecni.
 * @param {string | null | undefined} name
 * @returns {'kikiriki' | 'orasasti' | 'ghee' | 'aromatizirani' | 'mlijecni'}
 */
export function maslacFamilyId(name) {
  const n = String(name || '')
  if (isPeanutMaslacProduct(n)) return 'kikiriki'
  if (ORASASTI_MASLAC_RE.test(n)) return 'orasasti'
  if (GHEE_MASLAC_RE.test(n)) return 'ghee'
  if (isFlavoredHerbMaslacProduct(n)) return 'aromatizirani'
  return 'mlijecni'
}

/** @param {string | null | undefined} name */
export function queryWantsKikirikiMaslac(name) {
  return isPeanutMaslacProduct(name)
}

/** @param {string | null | undefined} name */
export function queryWantsOrasastiMaslac(name) {
  return ORASASTI_MASLAC_RE.test(String(name || '')) && !isPeanutMaslacProduct(name)
}

/** @param {string | null | undefined} name */
export function queryWantsGheeMaslac(name) {
  return GHEE_MASLAC_RE.test(String(name || ''))
}

/** @param {string | null | undefined} name */
export function queryWantsAromatiziraniMaslac(name) {
  return isFlavoredHerbMaslacProduct(name)
}

/**
 * Generički mliječni maslac — bez kikiriki / orašasto / ghee / začin.
 * Slani / Camargue / light / bez laktoze / kozji ostaju ovdje.
 * @param {string | null | undefined} name
 */
export function queryWantsGenericDairyMaslac(name) {
  const n = String(name || '')
  if (!/maslac/i.test(n)) return false
  if (queryWantsKikirikiMaslac(n)) return false
  if (queryWantsOrasastiMaslac(n)) return false
  if (queryWantsGheeMaslac(n)) return false
  if (queryWantsAromatiziraniMaslac(n)) return false
  return true
}

/**
 * Podvrsta maslaca ne odgovara queryju — prazan pool ostaje prazan (no_similar).
 * @param {string | null | undefined} queryName
 * @param {string | null | undefined} candidateName
 */
export function maslacSubtypeMismatch(queryName, candidateName) {
  if (isMaslacCosmeticProduct(candidateName)) return true
  if (isPopcornProduct(candidateName)) return true
  if (isMaslacIngredientProduct(candidateName)) return true
  const fam = maslacFamilyId(candidateName)
  if (queryWantsKikirikiMaslac(queryName)) return fam !== 'kikiriki'
  if (queryWantsOrasastiMaslac(queryName)) return fam !== 'orasasti'
  if (queryWantsGheeMaslac(queryName)) return fam !== 'ghee'
  if (queryWantsAromatiziraniMaslac(queryName)) return fam !== 'aromatizirani'
  if (queryWantsGenericDairyMaslac(queryName) || !queryName) {
    return fam !== 'mlijecni'
  }
  return false
}

/**
 * Njoki / gnocchi — zasebna obitelj unutar tipa tjestenina.
 * @param {string | null | undefined} name
 */
export function isNjokiProduct(name) {
  return GNOCCHI_RE.test(String(name || ''))
}

/**
 * Punjena / lasagne / gotovo / juha — nije suha tjestenina.
 * Njoki nije ovdje: query njoki smije vidjeti njoki kandidate.
 * @param {string | null | undefined} name
 */
export function isNonDryPastaProduct(name) {
  const n = String(name || '')
  return (
    STUFFED_PASTA_RE.test(n) ||
    LASAGNE_MEAL_RE.test(n) ||
    READY_PASTA_MEAL_RE.test(n) ||
    PASTA_SOUP_RE.test(n)
  )
}

/**
 * Query njoki → samo njoki; suha → ne njoki. Prazan pool ostaje prazan (no_similar).
 * @param {string | null | undefined} queryName
 * @param {string | null | undefined} candidateName
 */
export function tjesteninaSubtypeMismatch(queryName, candidateName) {
  if (isNonDryPastaProduct(candidateName)) return true
  const candNjoki = isNjokiProduct(candidateName)
  if (isNjokiProduct(queryName)) return !candNjoki
  return candNjoki
}

/**
 * ID-jevi oblika tjestenine u nazivu (prazno = nema eksplicitnog oblika).
 * @param {string | null | undefined} name
 * @returns {Set<string>}
 */
export function pastaShapeIdsInName(name) {
  const ids = new Set()
  for (const word of nameWordsUpper(name)) {
    const norm = pastaShapeWord(word)
    for (const g of PASTA_SHAPE_GROUPS) {
      if (g.wordRe.test(word) || g.wordRe.test(norm)) ids.add(g.id)
    }
  }
  return ids
}

/**
 * Kandidat dijeli oblik s queryjem (ili query nema oblik).
 * @param {string | null | undefined} queryName
 * @param {string | null | undefined} candidateName
 */
export function pastaShapeMatchesQuery(queryName, candidateName) {
  const queryShapes = pastaShapeIdsInName(queryName)
  if (!queryShapes.size) return true
  const candShapes = pastaShapeIdsInName(candidateName)
  for (const id of queryShapes) {
    if (candShapes.has(id)) return true
  }
  return false
}

/**
 * Različit eksplicitni oblik (npr. špagete vs mlinci) — preskoči kandidata.
 * @param {string | null | undefined} queryName
 * @param {string | null | undefined} candidateName
 */
export function pastaShapeMismatch(queryName, candidateName) {
  const queryShapes = pastaShapeIdsInName(queryName)
  const candShapes = pastaShapeIdsInName(candidateName)
  if (!queryShapes.size || !candShapes.size) return false
  return !pastaShapeMatchesQuery(queryName, candidateName)
}

/**
 * Suzi skup kandidata na isti oblik tjestenine; ako nema podudarnih, vrati original.
 * @template T
 * @param {T[]} candidates
 * @param {string | null | undefined} queryName
 * @param {(item: T) => string | null | undefined} getName
 * @returns {T[]}
 */
export function preferPastaShapeCandidates(candidates, queryName, getName) {
  const queryShapes = pastaShapeIdsInName(queryName)
  if (!queryShapes.size || !candidates.length) return candidates
  const matched = candidates.filter((c) => pastaShapeMatchesQuery(queryName, getName(c)))
  return matched.length ? matched : candidates
}

function isBakingPaperName(name) {
  return /\b(pe[cč]enj|pe[cč]\.|za\s+pe[cč])/i.test(String(name || ''))
}

function isToiletPaperName(name) {
  const n = String(name || '')
  if (isBakingPaperName(n)) return false
  return (
    /\btoalet/i.test(n) ||
    /\btoal\./i.test(n) ||
    /\btoal\b/i.test(n) ||
    /\bpapir\s+toal/i.test(n) ||
    /\bt\.?\s*papir/i.test(n)
  )
}

/** Kozmetika / njega s riječju „mlijeko“ u nazivu. */
const MLIJEKO_COSMETIC_RE =
  /\b(za\s+sun[cč]anj\w*|za\s+tijelo|za\s+tij\.|za\s+lice|za\s+[cč]i[sš][cć]en\w*|body\s*(milk|lotion|butter)|losion|maska|spf\b|zf\s*\d|nivea|ziaja|sunlove|afrodita)\b/i

/** Čokoladno / vanilija — ne bijelo mlijeko. Bez kakao (vafel). Bez `\b` pred Č. */
const MLIJEKO_FLAVORED_RE = /(?:čokolad|cokolad|vanil|čok\b|cok\b)/i

/** Bez laktoze uklj. skraćenicu „LAKT.“ */
const MLIJEKO_LACTOSE_FREE_RE = /(?:bez\s*laktoz|lactose\s*free|bezlakt|laktoz|lakt\.)/i

/** Meki / svježi sirevi. */
const CHEESE_SOFT_RE =
  /\b(svje[zž]|meki|meka|posni|posna|kremast|krem\s*sir|ricotta|skuta|cottage|quark|mascarpone|labne|zrnati|feta)\b/i

/** Tvrdi / zreli / tipični tvrdi brendovi-sorte. */
const CHEESE_HARD_RE =
  /\b(tvrdi|tvrda|zreli|zrela|gauda|gouda|edam(ac)?|trapist|grana|parmezan|parmigiano|pecorino|cheddar|emmental|maasdam|tilsit|istarski\s+tvrdi)\b/i

/** Dječja hrana s keksom — nije keks. */
const KEKS_BABY_FOOD_RE = /\b(ka[sš]ic\w*|ka[sš]a\b|nutrino|hipp)\b/i

const KEKS_KREKER_RE = /\bkreker/i
const KEKS_VAFEL_RE = /\b(vafel|vafl)\b/i
const KEKS_NAPOLITAN_RE = /\bnapolitan/i
const KEKS_WORD_RE = /\bkeks/i
const KEKS_BISKVIT_WORD_RE = /\bbiskvit/i
/** Biskvit-kolač (rolada / plum cake / kolač) — nije keks. Ne hvata „kolačiće“. */
const KEKS_BISKVIT_KOLAC_RE =
  /\b(rolad\w*|plum\s*cake|kola[cč](?:e|a|u|em|ima|i)?)(?!\p{L})/iu

/** Mesni sir = kobasica, ne sir. */
const CHEESE_MESNI_RE = /\bmesni\s+sir\b/i

/** Topljeni sir (uklj. skraćenice tipa „TOPLJ LIST“). */
const CHEESE_TOPLJENI_RE = /\btoplj/i

/** Mozzarella — ista obitelj (kugla / mini / ribana). */
const CHEESE_MOZZARELLA_RE = /\bmozzarell/i

/** Svježi/krem bez strogog `\b` na kraju — hvata SVJEZI. */
const CHEESE_SVJEZI_PREFIX_RE = /\bsvje[zž]/i

/** Pet / snack koji lažno uđu u tip sir. */
const CHEESE_PET_OR_SNACK_RE =
  /\b(dreamies|posl\.?\s*ma[cč]|hrana\s+za\s+(ma[cč]k|pse)|doritos|nacho)\b/i

/**
 * @param {string | null | undefined} name
 */
export function isMlijekoCosmeticProduct(name) {
  return MLIJEKO_COSMETIC_RE.test(String(name || ''))
}

/**
 * Čokoladno / vanilija mlijeko za piće.
 * @param {string | null | undefined} name
 */
export function isMlijekoFlavoredProduct(name) {
  return MLIJEKO_FLAVORED_RE.test(String(name || ''))
}

/**
 * Bez laktoze (uklj. „BEZ LAKT.“).
 * @param {string | null | undefined} name
 */
export function isMlijekoLactoseFreeProduct(name) {
  return MLIJEKO_LACTOSE_FREE_RE.test(String(name || ''))
}

/**
 * Čokoladno i bez laktoze su zatvorene obitelji. Kozmetika uvijek skip.
 * Prazan pool ostaje prazan (no_similar).
 * @param {string | null | undefined} queryName
 * @param {string | null | undefined} candidateName
 */
export function mlijekoSubtypeMismatch(queryName, candidateName) {
  if (isMlijekoCosmeticProduct(candidateName)) return true
  if (isMlijekoFlavoredProduct(queryName)) return !isMlijekoFlavoredProduct(candidateName)
  if (isMlijekoLactoseFreeProduct(queryName)) return !isMlijekoLactoseFreeProduct(candidateName)
  return isMlijekoFlavoredProduct(candidateName) || isMlijekoLactoseFreeProduct(candidateName)
}

/** Voćni jogurt uklj. kratice „VOĆ.“ / „JAG.“ / „VAN.“. Prefiks voć|voc (ne samo voćn). Bez `\b` pred Č. */
const JOGURT_FLAVORED_RE =
  /(?:voć|voc|jagod|\bjag\b|jag\.|borov|breskv|trešnj|tresnj|malin|banan|vanil|van\.|čokolad|cokolad|lje[šs]nik|okus|šljiv|sljiv|jabuk|smokv|višnj|visnj|yuzu|kokos|kava|marelic)/i

/** Tekući / za piti. `\btek\b` hvata „TEK ACTIVE“ (ne TEKUCI). */
const JOGURT_DRINK_RE = /(?:teku[cć]|tekuc|\btek\b|tek\.|za\s+piti|pitki|drink|lassi)/i

/**
 * Voćni / okusni jogurt (čaša), ne ravni natur.
 * @param {string | null | undefined} name
 */
export function isJogurtFlavoredProduct(name) {
  return JOGURT_FLAVORED_RE.test(String(name || ''))
}

/**
 * Tekući jogurt / drink, ne čaša.
 * @param {string | null | undefined} name
 */
export function isJogurtDrinkProduct(name) {
  return JOGURT_DRINK_RE.test(String(name || ''))
}

/**
 * Piće i voćni su zatvorene obitelji. Piće prvo (oblik, oba smjera).
 * Prazan pool ostaje prazan (no_similar).
 * @param {string | null | undefined} queryName
 * @param {string | null | undefined} candidateName
 */
export function jogurtSubtypeMismatch(queryName, candidateName) {
  const qDrink = isJogurtDrinkProduct(queryName)
  const cDrink = isJogurtDrinkProduct(candidateName)
  if (qDrink !== cDrink) return true
  if (qDrink) return false
  if (isJogurtFlavoredProduct(queryName)) return !isJogurtFlavoredProduct(candidateName)
  return isJogurtFlavoredProduct(candidateName)
}

/** Šlag / slatko vrhnje. `patiss` hvata Creme Patisserie bez riječi šlag. Bez `\b` pred Š. */
const VRHNJE_WHIP_RE = /(?:šlag|slag|slatk|whip|patiss)/i

/**
 * Vrhnje za šlag / slatko / patisserie, ne kuhanje.
 * @param {string | null | undefined} name
 */
export function isVrhnjeWhipProduct(name) {
  return VRHNJE_WHIP_RE.test(String(name || ''))
}

/**
 * Šlag je zatvorena obitelj. Prazan pool ostaje prazan (no_similar).
 * @param {string | null | undefined} queryName
 * @param {string | null | undefined} candidateName
 */
export function vrhnjeSubtypeMismatch(queryName, candidateName) {
  if (isVrhnjeWhipProduct(queryName)) return !isVrhnjeWhipProduct(candidateName)
  return isVrhnjeWhipProduct(candidateName)
}

/** Krafna / donut — ne kroasan. */
const PECIVO_KRAFNA_RE = /(?:krafn|donut)/i

/** Croissant / kroasan. `kroas` hvata KROASAN bez `\b` pred K. */
const PECIVO_CROISSANT_RE = /(?:croissant|kroasan|kroas)/i

/**
 * @param {string | null | undefined} name
 */
export function isPecivoKrafnaProduct(name) {
  return PECIVO_KRAFNA_RE.test(String(name || ''))
}

/**
 * @param {string | null | undefined} name
 */
export function isPecivoCroissantProduct(name) {
  return PECIVO_CROISSANT_RE.test(String(name || ''))
}

/**
 * Krafna i croissant su zatvorene obitelji. Generičko pecivo skipa obje.
 * Prazan pool ostaje prazan (no_similar).
 * @param {string | null | undefined} queryName
 * @param {string | null | undefined} candidateName
 */
export function pecivoSubtypeMismatch(queryName, candidateName) {
  if (isPecivoKrafnaProduct(queryName)) return !isPecivoKrafnaProduct(candidateName)
  if (isPecivoCroissantProduct(queryName)) return !isPecivoCroissantProduct(candidateName)
  return isPecivoKrafnaProduct(candidateName) || isPecivoCroissantProduct(candidateName)
}

/**
 * Postotak masti iz naziva mlijeka (npr. 2,8 → 2.8), ili null.
 * @param {string | null | undefined} name
 * @returns {number | null}
 */
export function milkFatPercentInName(name) {
  const m = String(name || '').match(/(\d+[,.]\d+)\s*%/)
  if (!m) return null
  const v = Number(String(m[1]).replace(',', '.'))
  return Number.isFinite(v) ? v : null
}

/**
 * Suzi kandidate na sličan % masti (±0,5); ako nema, vrati original.
 * @template T
 * @param {T[]} candidates
 * @param {string | null | undefined} queryName
 * @param {(item: T) => string | null | undefined} getName
 * @returns {T[]}
 */
export function preferMilkFatCandidates(candidates, queryName, getName) {
  const want = milkFatPercentInName(queryName)
  if (want == null || !candidates.length) return candidates
  const matched = candidates.filter((c) => {
    const p = milkFatPercentInName(getName(c))
    if (p == null) return false
    return Math.abs(p - want) <= 0.5
  })
  return matched.length ? matched : candidates
}

/**
 * @param {string | null | undefined} name
 * @returns {'soft' | 'hard' | null}
 */
export function cheeseTextureCategory(name) {
  const n = String(name || '')
  const soft = CHEESE_SOFT_RE.test(n)
  const hard = CHEESE_HARD_RE.test(n)
  if (soft && !hard) return 'soft'
  if (hard && !soft) return 'hard'
  // oba ili nijedno — nema jasne kategorije
  if (soft && hard) return null
  return null
}

/**
 * @param {string | null | undefined} name
 */
export function isMesniSirProduct(name) {
  return CHEESE_MESNI_RE.test(String(name || ''))
}

/**
 * @param {string | null | undefined} name
 */
export function isTopljeniSirProduct(name) {
  return CHEESE_TOPLJENI_RE.test(String(name || ''))
}

/**
 * @param {string | null | undefined} name
 */
export function isCheesePetOrSnackProduct(name) {
  return CHEESE_PET_OR_SNACK_RE.test(String(name || ''))
}

/**
 * Query traži prirodni/sorte sir (gouda, edam…), ne topljeni.
 * @param {string | null | undefined} name
 */
export function queryWantsNaturalHardCheese(name) {
  const n = String(name || '')
  if (isTopljeniSirProduct(n)) return false
  return CHEESE_HARD_RE.test(n)
}

/**
 * @param {string | null | undefined} name
 */
export function isMozzarellaProduct(name) {
  return CHEESE_MOZZARELLA_RE.test(String(name || ''))
}

/**
 * Svježi / krem / feta / zrnati — ne mozzarella, ne topljeni.
 * @param {string | null | undefined} name
 */
export function isSvjeziMekiSirProduct(name) {
  const n = String(name || '')
  if (isMozzarellaProduct(n) || isTopljeniSirProduct(n)) return false
  return CHEESE_SOFT_RE.test(n) || CHEESE_SVJEZI_PREFIX_RE.test(n)
}

/**
 * Mozzarella i topljeni su zatvorene obitelji; tvrdi query skipa i svježi/krem.
 * Prazan pool ostaje prazan (no_similar). Feta ostaje u mekom razredu.
 * @param {string | null | undefined} queryName
 * @param {string | null | undefined} candidateName
 */
export function sirSubtypeMismatch(queryName, candidateName) {
  if (isTopljeniSirProduct(queryName)) return !isTopljeniSirProduct(candidateName)
  if (isMozzarellaProduct(queryName)) return !isMozzarellaProduct(candidateName)
  if (queryWantsNaturalHardCheese(queryName)) {
    return (
      isTopljeniSirProduct(candidateName) ||
      isMozzarellaProduct(candidateName) ||
      isSvjeziMekiSirProduct(candidateName)
    )
  }
  return isTopljeniSirProduct(candidateName) || isMozzarellaProduct(candidateName)
}

/**
 * @param {string | null | undefined} name
 */
export function isKeksBabyFoodProduct(name) {
  return KEKS_BABY_FOOD_RE.test(String(name || ''))
}

/**
 * @param {string | null | undefined} name
 */
export function isKeksBiskvitKolacProduct(name) {
  return KEKS_BISKVIT_KOLAC_RE.test(String(name || ''))
}

/**
 * Obitelj unutar tipa keks: kreker | vafel | napolitanke | biskvit_kolac | keks.
 * @param {string | null | undefined} name
 * @returns {'kreker' | 'vafel' | 'napolitanke' | 'biskvit_kolac' | 'keks'}
 */
export function keksFamilyId(name) {
  const n = String(name || '')
  if (KEKS_KREKER_RE.test(n)) return 'kreker'
  if (KEKS_VAFEL_RE.test(n)) return 'vafel'
  if (KEKS_NAPOLITAN_RE.test(n)) return 'napolitanke'
  if (isKeksBiskvitKolacProduct(n)) return 'biskvit_kolac'
  return 'keks'
}

function queryHasExplicitKeksSubtype(name) {
  const n = String(name || '')
  return (
    KEKS_KREKER_RE.test(n) ||
    KEKS_VAFEL_RE.test(n) ||
    KEKS_NAPOLITAN_RE.test(n) ||
    KEKS_BISKVIT_WORD_RE.test(n)
  )
}

/**
 * Query eksplicitno traži kreker.
 * @param {string | null | undefined} name
 */
export function queryWantsKreker(name) {
  return KEKS_KREKER_RE.test(String(name || ''))
}

/**
 * Generički keks (KEKS/KEKSI) bez podvrste u nazivu.
 * @param {string | null | undefined} name
 */
export function queryWantsGenericKeks(name) {
  const n = String(name || '')
  return KEKS_WORD_RE.test(n) && !queryHasExplicitKeksSubtype(n)
}

/**
 * Podvrsta keksa ne odgovara queryju — preskoči kandidata (nema fallbacka na kreker/vafel).
 * @param {string | null | undefined} queryName
 * @param {string | null | undefined} candidateName
 */
export function keksSubtypeMismatch(queryName, candidateName) {
  if (isKeksBabyFoodProduct(candidateName)) return true
  if (isKeksBiskvitKolacProduct(candidateName)) return true
  if (queryWantsKreker(queryName)) return keksFamilyId(candidateName) !== 'kreker'
  if (queryWantsGenericKeks(queryName)) {
    const fam = keksFamilyId(candidateName)
    if (fam === 'kreker' || fam === 'vafel' || fam === 'napolitanke' || fam === 'biskvit_kolac') {
      return true
    }
    if (KEKS_BISKVIT_WORD_RE.test(String(candidateName || ''))) return true
  }
  return false
}

/** Toast / tost kruh — nije štruca. Ne hvata „tostirani“. */
const KRUH_TOAST_RE = /\b(?:toast|tost)(?!ir)/i
const KRUH_BAGUETTE_RE = /\b(?:baguette|baget)/i
const KRUH_BEZGLUTEN_RE = /\b(?:bez\s*glu|gluten\s*free)/i
const KRUH_SLATKI_RE =
  /\b(?:meden|marcipan|slatk|cimet|krafna|kroas|peciv|smokv)/i
const KRUH_HRSKAVI_RE = /\b(?:hrskav|kn[aä]cke|knacke|crisp)/i
const KRUH_FLOUR_RE = /\bbra[sš]no\b.*\bkruh|\bkruh\b.*\bbra[sš]no/i
const KRUH_POLUBIJELI_RE = /\bpolubijel/i
const KRUH_CRNI_RE =
  /\b(?:integral|integ\.?|ra[zž]en|graham|cjelovit|tamni|\bcrni\b)/i
const KRUH_KUKURUZ_RE = /\bkukuruz/i
const KRUH_BIJELI_RE = /\bbijel/i
const KRUH_WORD_RE = /\bkruh\b/i

/** @param {string | null | undefined} name */
export function isKruhToastProduct(name) {
  return KRUH_TOAST_RE.test(String(name || ''))
}

/** @param {string | null | undefined} name */
export function isKruhBaguetteProduct(name) {
  return KRUH_BAGUETTE_RE.test(String(name || ''))
}

/** @param {string | null | undefined} name */
export function isKruhBezglutenProduct(name) {
  return KRUH_BEZGLUTEN_RE.test(String(name || ''))
}

/** @param {string | null | undefined} name */
export function isKruhSlatkiProduct(name) {
  return KRUH_SLATKI_RE.test(String(name || ''))
}

/** @param {string | null | undefined} name */
export function isKruhHrskaviProduct(name) {
  return KRUH_HRSKAVI_RE.test(String(name || ''))
}

/** Brašno za kruh — nije kruh. */
export function isKruhFlourProduct(name) {
  return KRUH_FLOUR_RE.test(String(name || ''))
}

/**
 * Obitelj unutar tipa kruh.
 * Redoslijed: toast → baguette → bezgluten → slatki → hrskavi → polubijeli → crni → kukuruz → bijeli.
 * @param {string | null | undefined} name
 * @returns {'toast' | 'baguette' | 'bezgluten' | 'slatki' | 'hrskavi' | 'polubijeli' | 'crni_integral' | 'kukuruzni' | 'bijeli' | 'ostalo'}
 */
export function kruhFamilyId(name) {
  const n = String(name || '')
  if (isKruhToastProduct(n)) return 'toast'
  if (isKruhBaguetteProduct(n)) return 'baguette'
  if (isKruhBezglutenProduct(n)) return 'bezgluten'
  if (isKruhSlatkiProduct(n)) return 'slatki'
  if (isKruhHrskaviProduct(n)) return 'hrskavi'
  if (KRUH_POLUBIJELI_RE.test(n)) return 'polubijeli'
  if (KRUH_CRNI_RE.test(n)) return 'crni_integral'
  if (KRUH_KUKURUZ_RE.test(n)) return 'kukuruzni'
  if (KRUH_BIJELI_RE.test(n)) return 'bijeli'
  return 'ostalo'
}

/** @param {string | null | undefined} name */
export function queryWantsKruhToast(name) {
  return isKruhToastProduct(name)
}

/** @param {string | null | undefined} name */
export function queryWantsKruhBaguette(name) {
  return isKruhBaguetteProduct(name) && !isKruhToastProduct(name)
}

/** @param {string | null | undefined} name */
export function queryWantsKruhBezgluten(name) {
  return isKruhBezglutenProduct(name)
}

/** @param {string | null | undefined} name */
export function queryWantsKruhPolubijeli(name) {
  return KRUH_POLUBIJELI_RE.test(String(name || ''))
}

/** @param {string | null | undefined} name */
export function queryWantsKruhCrni(name) {
  const n = String(name || '')
  if (isKruhToastProduct(n)) return false
  return KRUH_CRNI_RE.test(n)
}

/** @param {string | null | undefined} name */
export function queryWantsKruhKukuruz(name) {
  return KRUH_KUKURUZ_RE.test(String(name || ''))
}

/**
 * Bijeli štruca — ne polubijeli, ne toast, ne baguette.
 * @param {string | null | undefined} name
 */
export function queryWantsKruhBijeli(name) {
  const n = String(name || '')
  if (!KRUH_BIJELI_RE.test(n)) return false
  if (queryWantsKruhPolubijeli(n)) return false
  if (isKruhToastProduct(n)) return false
  if (isKruhBaguetteProduct(n)) return false
  if (queryWantsKruhCrni(n)) return false
  return true
}

/**
 * Generički kruh bez boje / toast / baguette.
 * @param {string | null | undefined} name
 */
export function queryWantsGenericKruh(name) {
  const n = String(name || '')
  if (!KRUH_WORD_RE.test(n) && !isKruhToastProduct(n) && !isKruhBaguetteProduct(n)) {
    return false
  }
  if (queryWantsKruhToast(n) || queryWantsKruhBaguette(n)) return false
  if (queryWantsKruhBezgluten(n)) return false
  if (queryWantsKruhPolubijeli(n) || queryWantsKruhBijeli(n)) return false
  if (queryWantsKruhCrni(n) || queryWantsKruhKukuruz(n)) return false
  return KRUH_WORD_RE.test(n)
}

/**
 * Podvrsta kruha ne odgovara queryju — prazan pool ostaje prazan (no_similar).
 * @param {string | null | undefined} queryName
 * @param {string | null | undefined} candidateName
 */
export function kruhSubtypeMismatch(queryName, candidateName) {
  if (isKruhFlourProduct(candidateName)) return true
  if (isKruhSlatkiProduct(candidateName)) return true
  if (isKruhHrskaviProduct(candidateName)) return true
  const fam = kruhFamilyId(candidateName)
  if (queryWantsKruhToast(queryName)) return fam !== 'toast'
  if (queryWantsKruhBaguette(queryName)) return fam !== 'baguette'
  if (queryWantsKruhBezgluten(queryName)) return fam !== 'bezgluten'
  if (queryWantsKruhPolubijeli(queryName)) return fam !== 'polubijeli'
  if (queryWantsKruhCrni(queryName)) return fam !== 'crni_integral'
  if (queryWantsKruhKukuruz(queryName)) return fam !== 'kukuruzni'
  if (queryWantsKruhBijeli(queryName)) return fam !== 'bijeli'
  if (queryWantsGenericKruh(queryName) || !queryName) {
    return (
      fam === 'toast' ||
      fam === 'baguette' ||
      fam === 'bezgluten' ||
      fam === 'slatki' ||
      fam === 'hrskavi'
    )
  }
  return false
}

/**
 * Preferiraj istu teksturu sira; ako nema, dopusti fallback na sve.
 * @template T
 * @param {T[]} candidates
 * @param {string | null | undefined} queryName
 * @param {(item: T) => string | null | undefined} getName
 * @returns {T[]}
 */
export function preferCheeseTextureCandidates(candidates, queryName, getName) {
  const want = cheeseTextureCategory(queryName)
  if (!want || !candidates.length) return candidates
  const matched = candidates.filter((c) => cheeseTextureCategory(getName(c)) === want)
  return matched.length ? matched : candidates
}

/**
 * Toaletni papir ≠ papir za pečenje (i obrnuto).
 * @param {string | null | undefined} queryName
 * @param {string | null | undefined} candidateName
 */
function papirSubtypeMismatch(queryName, candidateName) {
  const qToilet = isToiletPaperName(queryName)
  const qBake = isBakingPaperName(queryName)
  const cToilet = isToiletPaperName(candidateName)
  const cBake = isBakingPaperName(candidateName)
  if (qToilet && cBake && !cToilet) return true
  if (qBake && cToilet && !cBake) return true
  return false
}

/**
 * @param {string | null | undefined} name
 */
export function isQuailEggProduct(name) {
  return QUAIL_EGG_RE.test(String(name || ''))
}

/**
 * @param {string | null | undefined} name
 */
export function isProcessedPotatoProduct(name) {
  return PROCESSED_POTATO_RE.test(String(name || ''))
}

/**
 * @param {string | null | undefined} name
 */
export function isPorridgeOrBabyOrPetFood(name) {
  const words = String(name || '')
    .toUpperCase()
    .normalize('NFC')
    .split(/[^A-ZČĆŽŠĐ]+/u)
    .filter(Boolean)
  return words.some((w) => NOT_MEAT_TOKENS.has(w))
}

/**
 * Tip-fallback preskoči kandidata (ili query ako applyToQuery).
 * @param {string | null | undefined} name
 * @param {string} typeKey
 * @param {string | null | undefined} [queryName] — artikl iz košarice; organi ostaju samo kad i query traži organ
 */
export function shouldSkipTypeFallbackCandidate(name, typeKey, queryName) {
  if (hasProcessedForm(name)) return true
  if (isTypeWordIngredient(name, typeKey)) return true
  if (typeKey === 'jaja') {
    if (isQuailEggProduct(name)) return true
    if (isChocolateOrFestiveEggProduct(name)) return true
  }
  if (typeKey === 'krumpir' && isProcessedPotatoProduct(name)) return true
  if (typeKey === 'papir' && queryName && papirSubtypeMismatch(queryName, name)) return true
  if (typeKey === 'maslac') {
    if (maslacSubtypeMismatch(queryName, name)) return true
  }
  if (typeKey === 'tjestenina') {
    if (tjesteninaSubtypeMismatch(queryName, name)) return true
    if (queryName && pastaShapeMismatch(queryName, name)) return true
  }
  if (typeKey === 'mlijeko') {
    if (mlijekoSubtypeMismatch(queryName, name)) return true
  }
  if (typeKey === 'jogurt') {
    if (jogurtSubtypeMismatch(queryName, name)) return true
  }
  if (typeKey === 'vrhnje') {
    if (vrhnjeSubtypeMismatch(queryName, name)) return true
  }
  if (typeKey === 'pecivo') {
    if (pecivoSubtypeMismatch(queryName, name)) return true
  }
  if (typeKey === 'keks') {
    if (keksSubtypeMismatch(queryName, name)) return true
  }
  if (typeKey === 'kruh') {
    if (kruhSubtypeMismatch(queryName, name)) return true
  }
  if (typeKey === 'sir') {
    if (isMesniSirProduct(name)) return true
    if (isCheesePetOrSnackProduct(name)) return true
    if (isPetFood(name)) return true
    if (sirSubtypeMismatch(queryName, name)) return true
  }
  if (isMeatType(typeKey)) {
    if (isReadyMealOrMeatProduct(name)) return true
    if (isPetFood(name)) return true
    if (isOrganProduct(name) && !isOrganProduct(queryName)) return true
    if (isMeatFatProduct(name)) return true
    if (queryName && queryWantsGroundMeat(queryName) && isOdresciProduct(name)) return true
    if (queryName && queryWantsCleanFile(queryName) && isMixFileProduct(name)) return true
  }
  return false
}

/** @param {string | null | undefined} name */
export function shouldSkipTypeFallbackQuery(name) {
  if (hasProcessedForm(name)) return true
  if (isReadyMealOrMeatProduct(name)) return true
  if (isPetFood(name)) return true
  if (isKeksBabyFoodProduct(name)) return true
  if (isMlijekoCosmeticProduct(name)) return true
  if (isMesniSirProduct(name)) return true
  if (isCheesePetOrSnackProduct(name)) return true
  if (/maslac/i.test(String(name || ''))) {
    if (isMaslacCosmeticProduct(name)) return true
    if (isPopcornProduct(name)) return true
    if (isMaslacIngredientProduct(name)) return true
  }
  if (/kruh/i.test(String(name || ''))) {
    if (isKruhFlourProduct(name)) return true
    if (isKruhSlatkiProduct(name)) return true
    if (isKruhHrskaviProduct(name)) return true
  }
  return false
}

/** Kratke poruke za UI košarice. */
export const UNAVAILABLE_REASON_LABELS = {
  cannot_compare: 'ne možemo usporediti ovaj artikl',
  not_in_catalog: 'nije u katalogu ovog lanca',
  no_similar: 'nema dovoljno sličnog artikla',
}

/**
 * @param {string | null | undefined} reason
 */
export function unavailableReasonLabel(reason) {
  if (!reason) return UNAVAILABLE_REASON_LABELS.no_similar
  return UNAVAILABLE_REASON_LABELS[reason] || UNAVAILABLE_REASON_LABELS.no_similar
}
