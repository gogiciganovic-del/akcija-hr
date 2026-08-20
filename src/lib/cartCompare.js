import { supabase } from './supabase'
import { STORES, chainFromStoreName } from './constants'
import { matchProductType, getProductType, tokenizeNameForType } from './productTypes'
import { parseQuantityFromName, pricePerBaseUnit } from './quantityParse'
import { normalizeImageUrl } from './productImage'
import {
  shouldSkipTypeFallbackCandidate,
  shouldSkipTypeFallbackQuery,
  UNAVAILABLE_REASON_LABELS,
} from './typeFallbackFilters.js'

export { UNAVAILABLE_REASON_LABELS, unavailableReasonLabel } from './typeFallbackFilters.js'

const DEAL_IMAGE_IN_CHUNK = 80
const DEAL_IMAGE_PAGE = 1000

/** Letak-sufiks s najcijena.hr — katalog-nazivi ga nemaju. */
function stripDealNameSuffix(name) {
  return String(name || '')
    .replace(/\s+akcija\s+u\s+trgovini\s+.+$/i, '')
    .trim()
}

function normalizeDealNameKey(name) {
  return stripDealNameSuffix(name).toLowerCase().replace(/\s+/g, ' ').trim()
}

function escapeIlike(s) {
  return String(s || '').replace(/[%_,]/g, '')
}

const SALE_DEAL_COLS =
  'deal_id, product_id, name, store_name, price, original_price, discount_pct, image_url, category'

/** Kratki cache dealova po lancu — findSaleExact fallback (letak-sufiks). */
const dealsByChainCache = new Map()

async function loadDealsForChain(chain) {
  const hit = dealsByChainCache.get(chain)
  if (hit && Date.now() - hit.at < 60_000) return hit.rows

  const storeOr = `store_name.ilike.%${chain}%`
  const rows = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('active_deals')
      .select(SALE_DEAL_COLS)
      .or(storeOr)
      .order('price', { ascending: true })
      .range(from, from + DEAL_IMAGE_PAGE - 1)
    if (error) throw error
    if (!data?.length) break
    rows.push(...data)
    if (data.length < DEAL_IMAGE_PAGE) break
    from += DEAL_IMAGE_PAGE
  }
  dealsByChainCache.set(chain, { at: Date.now(), rows })
  return rows
}

function saleHitFromDealRow(row) {
  const price = parsePrice(row.price)
  if (price == null) return null
  const originalPrice = parsePrice(row.original_price)
  return {
    name: row.name,
    price,
    originalPrice: originalPrice ?? price,
    deal: row,
  }
}

/**
 * Batch: slike iz active_deals za pronađene artikle (po barkodu ili točnom nazivu + lanac).
 * Ne dira matching — samo obogaćuje već resolved linije.
 */
async function attachDealImages(primary, others) {
  /** @type {{ chain: string, line: object }[]} */
  const targets = []
  if (primary?.lines) {
    for (const line of primary.lines) {
      if (line?.available) targets.push({ chain: primary.chain, line })
    }
  }
  for (const row of others || []) {
    for (const line of row.lines || []) {
      if (line?.available) targets.push({ chain: row.chain, line })
    }
  }
  if (!targets.length) return

  const barcodes = [
    ...new Set(
      targets
        .map((t) => String(t.line.barcode || '').trim())
        .filter((b) => b.length >= 8)
    ),
  ]
  const chainIds = [...new Set(targets.map((t) => t.chain).filter(Boolean))]

  const byChainBarcode = new Map()
  const byChainName = new Map()

  const ingest = (rows) => {
    for (const row of rows || []) {
      const url = normalizeImageUrl(row.image_url)
      if (!url) continue
      const chain = chainFromStoreName(row.store_name)
      if (!chain) continue
      const bc = String(row.barcode || '').trim()
      if (bc) {
        const key = `${chain}|${bc}`
        if (!byChainBarcode.has(key)) byChainBarcode.set(key, url)
      }
      const nm = normalizeDealNameKey(row.name)
      if (nm) {
        const key = `${chain}|${nm}`
        if (!byChainName.has(key)) byChainName.set(key, url)
      }
    }
  }

  for (let i = 0; i < barcodes.length; i += DEAL_IMAGE_IN_CHUNK) {
    const chunk = barcodes.slice(i, i + DEAL_IMAGE_IN_CHUNK)
    const { data, error } = await supabase
      .from('active_deals')
      .select('barcode, name, store_name, image_url')
      .in('barcode', chunk)
    if (error) throw error
    ingest(data)
  }

  // Nazivi akcija imaju sufiks; .in('name', katalog) ne pogađa. Dohvati deals
  // za lance u rezultatu, pa usporedi očišćeni naziv (case/space insensitive).
  if (chainIds.length) {
    const storeOr = chainIds.map((c) => `store_name.ilike.%${c}%`).join(',')
    let from = 0
    while (true) {
      const { data, error } = await supabase
        .from('active_deals')
        .select('barcode, name, store_name, image_url')
        .or(storeOr)
        .not('image_url', 'is', null)
        .range(from, from + DEAL_IMAGE_PAGE - 1)
      if (error) throw error
      ingest(data)
      if (!data?.length || data.length < DEAL_IMAGE_PAGE) break
      from += DEAL_IMAGE_PAGE
    }
  }

  const enrichLine = (line, chain) => {
    if (!line?.available) return line
    const bc = String(line.barcode || '').trim()
    const nm = normalizeDealNameKey(line.name)
    let imageUrl = null
    if (bc) imageUrl = byChainBarcode.get(`${chain}|${bc}`) || null
    if (!imageUrl && nm) imageUrl = byChainName.get(`${chain}|${nm}`) || null
    if (!imageUrl) return line
    return { ...line, imageUrl }
  }

  if (primary?.lines) {
    primary.lines = primary.lines.map((line) => enrichLine(line, primary.chain))
  }
  for (const row of others || []) {
    row.lines = (row.lines || []).map((line) => enrichLine(line, row.chain))
  }
}

function round2(n) {
  return Math.round(n * 100) / 100
}

function parsePrice(v) {
  const n = parseFloat(v)
  return Number.isNaN(n) ? null : n
}

/** Lanci s redovnim cijenama (v1 crawl). */
export const REGULAR_PRICE_CHAINS = [
  'Lidl',
  'Kaufland',
  'Konzum',
  'Spar',
  'Plodine',
  'Eurospin',
  'Tommy',
  'Studenac',
  'Dm',
]

function baseUnitOf(unit) {
  if (unit === 'g' || unit === 'kg') return 'kg'
  if (unit === 'ml' || unit === 'L') return 'L'
  if (unit === 'kom') return 'kom'
  return null
}

/** Količina u baznoj jedinici (kg, L ili kom) radi usporedbe pakiranja. */
function quantityInBase(value, unit) {
  const v = Number(value)
  if (!Number.isFinite(v) || v <= 0) return null
  if (unit === 'g' || unit === 'ml') return v / 1000
  if (unit === 'kg' || unit === 'L' || unit === 'kom') return v
  return null
}

/**
 * Kombinirani proizvodi (šampon 2u1, det+omekšivač…) — ne uspoređuj po tipu.
 */
function isComboProduct(name) {
  return /\b2\s*u\s*1\b|\b2\s*in\s*1\b|\b2\s*&\s*1\b/i.test(String(name || ''))
}

/**
 * Značajne riječi naziva: bez brojeva/jedinica i bez tokena tipa (SIR, ULJE, KAVA…).
 * Zahtjev za fallback samo kod generičkih tipova (bez '_'): barem jedna zajednička
 * s kandidatom — osim kad naziv nema druge riječi osim tipa. Podtipovi (voda_gazirana,
 * ulje_maslinovo…) već su dovoljno uski; dodatna riječ samo blokira ispravne pogotke.
 */
function significantNameTokens(name, typeMeta) {
  const typeTokens = new Set(
    (typeMeta?.matches || []).map((m) => String(m).toUpperCase())
  )
  if (typeMeta?.key) typeTokens.add(String(typeMeta.key).toUpperCase())
  if (typeMeta?.label) {
    for (const t of tokenizeNameForType(typeMeta.label)) typeTokens.add(t)
  }
  // Ambalaža / šum — ne broje se kao „zajednička riječ”
  for (const w of ["PET", "PACK", "PROMO", "XXL", "DUO", "SET", "MINI"]) {
    typeTokens.add(w)
  }
  return tokenizeNameForType(name).filter((t) => t.length >= 3 && !typeTokens.has(t))
}

function sharesSignificantWord(queryTokens, candidateName, typeMeta) {
  if (!queryTokens.length) return true
  const cand = new Set(significantNameTokens(candidateName, typeMeta))
  return queryTokens.some((t) => cand.has(t))
}

function requiresSharedSignificantWord(typeKey) {
  return !String(typeKey || '').includes('_')
}

function packSizeOk(wantedBaseQty, candValue, candUnit, wantedUnitSizeBase, candUnitSizeBase) {
  const candBase = quantityInBase(candValue, candUnit)
  // Za multipack usporedi veličinu jednog komada (1.5 L), ne ukupno (9 L)
  const wanted = wantedUnitSizeBase ?? wantedBaseQty
  const cand = candUnitSizeBase ?? candBase
  if (wanted == null || cand == null) return false
  return cand >= wanted * 0.5 && cand <= wanted * 2
}

function median(nums) {
  if (!nums.length) return null
  const s = [...nums].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * Fallback: najniži €/kg (ili €/L / €/kom) unutar product_type u lancu.
 * Vraća { available: true, ... } ili { available: false, unavailableReason }.
 */
async function resolveByTypeUnitPrice(item, chain) {
  const name = (item.name || '').trim()
  if (isComboProduct(name)) {
    return { available: false, unavailableReason: 'no_similar' }
  }
  const typeKey = matchProductType(name)
  const qty = parseQuantityFromName(name)
  if (!typeKey || !qty) {
    return { available: false, unavailableReason: 'cannot_compare' }
  }

  const wantedBase = baseUnitOf(qty.unit)
  if (!wantedBase) {
    return { available: false, unavailableReason: 'cannot_compare' }
  }

  const typeMeta = getProductType(typeKey)
  if (!typeMeta) {
    return { available: false, unavailableReason: 'cannot_compare' }
  }

  const wantedBaseQty = quantityInBase(qty.value, qty.unit)
  if (wantedBaseQty == null) {
    return { available: false, unavailableReason: 'cannot_compare' }
  }
  const wantedUnitSizeBase =
    qty.unitValue != null ? quantityInBase(qty.unitValue, qty.unit) : null

  const querySig = significantNameTokens(name, typeMeta)

  const cols =
    'barcode, name, brand, chain, price, special_price, product_type, quantity_value, quantity_unit'

  let rows = []
  const byType = await supabase
    .from('regular_prices')
    .select(cols)
    .eq('chain', chain)
    .eq('product_type', typeKey)
    .limit(100)

  if (!byType.error && byType.data?.length) {
    rows = byType.data
  } else {
    const tokens = typeMeta.matches
      .filter((m) => /^[\p{L}\p{N}]+$/u.test(m) && m.length >= 3)
      .slice(0, 5)
    if (!tokens.length) {
      return { available: false, unavailableReason: 'not_in_catalog' }
    }
    const orFilter = tokens.map((t) => `name.ilike.${t}%`).join(',')
    const byName = await supabase
      .from('regular_prices')
      .select(cols)
      .eq('chain', chain)
      .or(orFilter)
      .limit(100)
    if (byName.error) {
      return { available: false, unavailableReason: 'not_in_catalog' }
    }
    rows = byName.data || []
  }

  const typedRows = rows.filter((row) => matchProductType(row.name) === typeKey)
  if (!typedRows.length) {
    return { available: false, unavailableReason: 'not_in_catalog' }
  }

  const needSharedWord = requiresSharedSignificantWord(typeKey)

  /** @type {{ row: object, perUnit: number, unitLabel: string, price: number }[]} */
  const cands = []
  for (const row of typedRows) {
    if (isComboProduct(row.name)) continue
    if (shouldSkipTypeFallbackCandidate(row.name, typeKey)) continue
    if (needSharedWord && !sharesSignificantWord(querySig, row.name, typeMeta)) continue

    let qv = row.quantity_value != null ? Number(row.quantity_value) : null
    let qu = row.quantity_unit || null
    let candUnitSizeBase = null
    const parsed = parseQuantityFromName(row.name)
    if (parsed?.unitValue != null) {
      candUnitSizeBase = quantityInBase(parsed.unitValue, parsed.unit)
    }
    if (qv == null || !qu) {
      if (!parsed) continue
      qv = parsed.value
      qu = parsed.unit
    }
    if (baseUnitOf(qu) !== wantedBase) continue
    if (!packSizeOk(wantedBaseQty, qv, qu, wantedUnitSizeBase, candUnitSizeBase)) continue

    const price = parsePrice(row.special_price) ?? parsePrice(row.price)
    if (price == null || price <= 0) continue
    const per = pricePerBaseUnit(price, qv, qu)
    if (!per || per.perUnit <= 0) continue
    cands.push({ row, perUnit: per.perUnit, unitLabel: per.unitLabel, price })
  }

  if (!cands.length) {
    return { available: false, unavailableReason: 'no_similar' }
  }

  const med = median(cands.map((c) => c.perUnit))
  const filtered =
    med != null && med > 0
      ? cands.filter((c) => c.perUnit >= med / 5 && c.perUnit <= 5 * med)
      : cands
  const pool = filtered.length ? filtered : cands
  pool.sort((a, b) => a.perUnit - b.perUnit)
  const best = pool[0]

  const sale = await findSaleExact((best.row.name || '').trim(), chain)
  if (sale) {
    return {
      available: true,
      price: sale.price,
      originalPrice: sale.originalPrice ?? best.price,
      priceSource: 'sale',
      name: sale.name,
      barcode: best.row.barcode || null,
      matchedBy: 'type_unit',
      productType: typeKey,
      productTypeLabel: typeMeta.label,
      unitPrice: best.perUnit,
      unitLabel: best.unitLabel,
    }
  }

  return {
    available: true,
    price: best.price,
    originalPrice: best.price,
    priceSource: 'regular',
    name: best.row.name,
    barcode: best.row.barcode || null,
    matchedBy: 'type_unit',
    productType: typeKey,
    productTypeLabel: typeMeta.label,
    unitPrice: best.perUnit,
    unitLabel: best.unitLabel,
  }
}

/**
 * Nađi cijenu artikla kod jednog lanca.
 * Prioritet: barkod → točan naziv → (€/kg tip kao fallback).
 */
async function resolveItemAtChain(item, chain) {
  const name = (item.name || '').trim()
  const barcode = (item.barcode || '').trim() || null

  if (barcode) {
    const { data: byBarcode, error: bcErr } = await supabase
      .from('regular_prices')
      .select('barcode, name, brand, chain, price, category, special_price')
      .eq('chain', chain)
      .eq('barcode', barcode)
      .limit(1)

    if (bcErr) throw bcErr
    const reg = byBarcode?.[0]
    if (reg) {
      const exactName = (reg.name || name).trim()
      const sale = await findSaleExact(exactName, chain)
      const regularPrice = parsePrice(reg.price)
      if (sale) {
        return {
          available: true,
          price: sale.price,
          originalPrice: sale.originalPrice ?? regularPrice,
          priceSource: 'sale',
          name: sale.name,
          barcode: reg.barcode,
          matchedBy: 'barcode',
        }
      }
      return {
        available: true,
        price: regularPrice,
        originalPrice: regularPrice,
        priceSource: 'regular',
        name: reg.name,
        barcode: reg.barcode,
        matchedBy: 'barcode',
      }
    }
  }

  if (!name) {
    return {
      available: false,
      price: null,
      originalPrice: null,
      priceSource: null,
      name,
      barcode,
      matchedBy: null,
      unavailableReason: 'cannot_compare',
    }
  }

  const sale = await findSaleExact(name, chain)
  if (sale) {
    return {
      available: true,
      price: sale.price,
      originalPrice: sale.originalPrice,
      priceSource: 'sale',
      name: sale.name,
      barcode,
      matchedBy: 'name',
    }
  }

  const { data: regRows, error: regErr } = await supabase
    .from('regular_prices')
    .select('barcode, name, brand, chain, price, category, special_price')
    .eq('chain', chain)
    .eq('name', name)
    .order('price', { ascending: true })
    .limit(1)

  if (regErr) throw regErr
  const reg = regRows?.[0]
  if (reg) {
    const regularPrice = parsePrice(reg.price)
    return {
      available: true,
      price: regularPrice,
      originalPrice: regularPrice,
      priceSource: 'regular',
      name: reg.name,
      barcode: reg.barcode || barcode,
      matchedBy: 'name',
    }
  }

  // Fallback: €/kg po tipu (nije isti artikl)
  const typeKey = matchProductType(name)
  const qty = parseQuantityFromName(name)
  const canTypeFallback =
    typeKey &&
    qty &&
    baseUnitOf(qty.unit) &&
    !isComboProduct(name) &&
    !shouldSkipTypeFallbackQuery(name)

  if (!canTypeFallback) {
    const reason =
      !typeKey || !qty || !baseUnitOf(qty?.unit)
        ? 'cannot_compare'
        : 'no_similar'
    return {
      available: false,
      price: null,
      originalPrice: null,
      priceSource: null,
      name,
      barcode,
      matchedBy: null,
      unavailableReason: reason,
    }
  }

  const byType = await resolveByTypeUnitPrice(item, chain)
  if (byType.available) return byType

  return {
    available: false,
    price: null,
    originalPrice: null,
    priceSource: null,
    name,
    barcode,
    matchedBy: null,
    unavailableReason: byType.unavailableReason || 'no_similar',
  }
}

/**
 * Akcija za lanac: točan naziv, zatim isti normalizeDealNameKey
 * (strip „Akcija u trgovini …“ + case/space). Bez fuzzy / tip-fallbacka.
 */
async function findSaleExact(name, chain) {
  const nameTrim = (name || '').trim()
  if (!nameTrim || !chain) return null
  const wantKey = normalizeDealNameKey(nameTrim)
  if (!wantKey) return null

  const { data: exactRows, error: exactErr } = await supabase
    .from('active_deals')
    .select(SALE_DEAL_COLS)
    .eq('name', nameTrim)
    .order('price', { ascending: true })
    .limit(40)

  if (exactErr) throw exactErr
  for (const row of exactRows || []) {
    if (chainFromStoreName(row.store_name) !== chain) continue
    const hit = saleHitFromDealRow(row)
    if (hit) return hit
  }

  const needle = escapeIlike(nameTrim)
  if (needle.length >= 3) {
    const { data: prefixRows, error: prefixErr } = await supabase
      .from('active_deals')
      .select(SALE_DEAL_COLS)
      .ilike('name', `${needle}%`)
      .order('price', { ascending: true })
      .limit(80)

    if (prefixErr) throw prefixErr
    for (const row of prefixRows || []) {
      if (chainFromStoreName(row.store_name) !== chain) continue
      if (normalizeDealNameKey(row.name) !== wantKey) continue
      const hit = saleHitFromDealRow(row)
      if (hit) return hit
    }
  }

  // Fallback: svi deals lanca (cache), match samo po očišćenom ključu
  const chainDeals = await loadDealsForChain(chain)
  for (const row of chainDeals) {
    if (chainFromStoreName(row.store_name) !== chain) continue
    if (normalizeDealNameKey(row.name) !== wantKey) continue
    const hit = saleHitFromDealRow(row)
    if (hit) return hit
  }
  return null
}

/**
 * Primarni lanac: ukupna cijena + ušteda na akcijskim stavkama.
 * Ostali lanci: barkod → točan naziv → fallback najniži €/kg unutar product_type
 * (cijena > 0, pakiranje 0,5×–2×, bez 2u1; zajednička riječ samo za generičke tipove).
 * Tip-fallback nije isti artikl; bez kandidata → nedostupno.
 *
 * @param {string} selectedChain
 * @param {Array<{ id?: string, name: string, barcode?: string|null, price?: number, originalPrice?: number, priceSource?: string }>} items
 */
export async function analyzeChainCart(selectedChain, items) {
  if (!selectedChain) {
    return {
      selectedChain: null,
      primary: null,
      others: [],
      itemCount: 0,
    }
  }

  if (!items?.length) {
    return {
      selectedChain,
      primary: {
        chain: selectedChain,
        label: STORES.find((s) => s.id === selectedChain)?.label || selectedChain,
        total: 0,
        savings: 0,
        lines: [],
        complete: true,
      },
      others: [],
      itemCount: 0,
    }
  }

  const primaryLines = await Promise.all(
    items.map(async (item) => {
      const resolved = await resolveItemAtChain(item, selectedChain)
      // Ako resolve ne nađe, a stavka već ima cijenu s autocompletea — koristi ju
      if (!resolved.available && item.price != null) {
        const price = parsePrice(item.price)
        const originalPrice = parsePrice(item.originalPrice) ?? price
        return {
          cartName: item.name,
          available: true,
          price,
          originalPrice,
          priceSource: item.priceSource || 'regular',
          name: item.name,
          barcode: item.barcode || null,
          matchedBy: 'cart',
          savings: 0,
        }
      }

      const price = resolved.price
      const originalPrice = resolved.originalPrice ?? price
      let savings = 0
      if (
        resolved.available &&
        resolved.priceSource === 'sale' &&
        originalPrice != null &&
        price != null &&
        originalPrice > price
      ) {
        savings = round2(originalPrice - price)
      }

      return {
        cartName: item.name,
        ...resolved,
        savings,
      }
    })
  )

  const primaryTotal = round2(
    primaryLines.reduce((sum, line) => sum + (line.available && line.price != null ? line.price : 0), 0)
  )
  const primarySavings = round2(
    primaryLines.reduce((sum, line) => sum + (line.savings || 0), 0)
  )
  const primaryComplete = primaryLines.every((l) => l.available)

  const otherChainIds = REGULAR_PRICE_CHAINS.filter((id) => id !== selectedChain)

  const others = await Promise.all(
    otherChainIds.map(async (chain) => {
      const lines = await Promise.all(
        items.map(async (item) => {
          const resolved = await resolveItemAtChain(item, chain)
          return {
            cartName: item.name,
            ...resolved,
            status: resolved.available ? 'ok' : 'unavailable',
          }
        })
      )

      const availableLines = lines.filter((l) => l.available && l.price != null)
      const total = round2(availableLines.reduce((sum, l) => sum + l.price, 0))
      const missing = lines.filter((l) => !l.available).length
      const found = lines.length - missing

      return {
        chain,
        label: STORES.find((s) => s.id === chain)?.label || chain,
        total,
        missing,
        found,
        complete: missing === 0,
        lines,
      }
    })
  )

  others.sort((a, b) => {
    if (a.complete !== b.complete) return a.complete ? -1 : 1
    if (a.missing !== b.missing) return a.missing - b.missing
    return a.total - b.total
  })

  const primaryFound = primaryLines.filter((l) => l.available).length

  const primary = {
    chain: selectedChain,
    label: STORES.find((s) => s.id === selectedChain)?.label || selectedChain,
    total: primaryTotal,
    savings: primarySavings,
    lines: primaryLines,
    complete: primaryComplete,
    found: primaryFound,
  }

  await attachDealImages(primary, others)

  return {
    selectedChain,
    primary,
    others,
    itemCount: items.length,
  }
}

/**
 * @deprecated Stari fuzzy multi-chain tok. Koristi analyzeChainCart.
 * Ostaje da CartPage ne pukne dok se UI ne preradi — vraća prazan rezultat.
 */
export async function compareCart() {
  console.warn(
    'compareCart() je zastario. Koristi analyzeChainCart(selectedChain, items).'
  )
  return { rankings: [], unmatched: [], itemCount: 0 }
}
