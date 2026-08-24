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

/** Kokice s okusom maslaca — nije maslac. */
const POPCORN_RE = /\bkokic/i

/** Kikiriki namaz pogrešno označen kao maslac. */
const PEANUT_MASLAC_RE = /maslac.*kikiriki|kikiriki.*maslac/i

/** Kozmetika / njega (maslac za tijelo, usne, dren…). */
const MASLAC_COSMETIC_RE =
  /\b(za\s+(tijelo|tij\.|usne|usna|ruke|lice)|maslac\s+za\s+(tij|usn|ruk|lic)|\bdren\b|deodorant|njeg[aeu]\s+ko[zs]e|body\s+butter|sol\s+de\s+janeiro)\b/i

/** Aromatizirani maslac (začinsko bilje) — druga namjena od običnog. */
const FLAVORED_MASLAC_RE =
  /za[cč]in\.?\s*bilj|bilj.*za[cč]in|za[cč]insk|trio\s+za[cč]in/i

/** Punjena / njoki / lasagne / gotova jela — nije suha tjestenina. */
const STUFFED_PASTA_RE = /\bpunjen/i
const GNOCCHI_RE = /\bnjok/i
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
  if (MASLAC_COSMETIC_RE.test(n)) return true
  // mali ml + maslac bez % mm → često kozmetika (npr. 75 ml dren)
  if (/maslac/i.test(n) && /\b\d+\s*ml\b/i.test(n) && !/\b\d+\s*g\b/i.test(n) && !/\bmm\b/i.test(n)) {
    if (/\b(za\s+tij|dren|shea|kokos\s*&\s*shea|njeg)/i.test(n)) return true
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
 * @param {string | null | undefined} name
 */
export function isNonDryPastaProduct(name) {
  const n = String(name || '')
  return (
    STUFFED_PASTA_RE.test(n) ||
    GNOCCHI_RE.test(n) ||
    LASAGNE_MEAL_RE.test(n) ||
    READY_PASTA_MEAL_RE.test(n) ||
    PASTA_SOUP_RE.test(n)
  )
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
    if (isPopcornProduct(name)) return true
    if (isPeanutMaslacProduct(name)) return true
    if (isMaslacCosmeticProduct(name)) return true
    if (isFlavoredHerbMaslacProduct(name)) return true
  }
  if (typeKey === 'tjestenina') {
    if (isNonDryPastaProduct(name)) return true
    if (queryName && pastaShapeMismatch(queryName, name)) return true
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
