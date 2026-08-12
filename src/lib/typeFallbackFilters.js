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

/** Prerađeni oblici — drugi cijenski razred unutar istog tipa. */
const PROCESSED_FORM_RE =
  /\b(medaljon\w*|paniran\w*|punjen\w*|punjena\w*|mariniran\w*|gratiniran\w*|u\s+umaku)\b/i

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
  if (typeKey === 'meso_piletina' && isPorridgeOrBabyOrPetFood(name)) return true
  return false
}

/** @param {string | null | undefined} name */
export function shouldSkipTypeFallbackQuery(name) {
  return hasProcessedForm(name)
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
