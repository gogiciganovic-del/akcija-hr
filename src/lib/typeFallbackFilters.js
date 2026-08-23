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
  /\b(paprika[sš]|ra[nž]nji[cć]|ra[nž]nji[cć]i|[čc]evap|[čc]evap[cč]i[cć]|hrenovk|nuget|nugget|burger|kobasic|\bkob\b|pa[sš]tet|lazanj|lasagn)\w*/i

/** Hrana za kućne ljubimce (i kad piše piletina/govedina u nazivu). */
const PET_FOOD_RE =
  /\b(hrana\s+za\s+(ma[cč]k|ma[cč]ke|pse|pasa)|za\s+(ma[cč]k|ma[cč]ke|pse)\b|friskies|petties|whiskas|pedigree|felix|gourmet|hobby\s*dog|kitty|macke|ma[cč]ke|buddy|mg\s+mm)\b/i

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
 */
export function shouldSkipTypeFallbackCandidate(name, typeKey) {
  if (hasProcessedForm(name)) return true
  if (isTypeWordIngredient(name, typeKey)) return true
  if (isMeatType(typeKey)) {
    if (isReadyMealOrMeatProduct(name)) return true
    if (isPetFood(name)) return true
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
