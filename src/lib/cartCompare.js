import { supabase } from './supabase'
import { STORES, chainFromStoreName } from './constants'
import { matchProductType, getProductType, tokenizeNameForType } from './productTypes'
import { parseQuantityFromName, pricePerBaseUnit } from './quantityParse'

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
  return null
}

/** Količina u baznoj jedinici (kg ili L) radi usporedbe pakiranja. */
function quantityInBase(value, unit) {
  const v = Number(value)
  if (!Number.isFinite(v) || v <= 0) return null
  if (unit === 'g' || unit === 'ml') return v / 1000
  if (unit === 'kg' || unit === 'L') return v
  return null
}

/**
 * Značajne riječi naziva: bez brojeva/jedinica i bez tokena tipa (SIR, ULJE, KAVA…).
 * Zahtjev za fallback: barem jedna zajednička s kandidatom.
 */
function significantNameTokens(name, typeMeta) {
  const typeTokens = new Set(
    (typeMeta?.matches || []).map((m) => String(m).toUpperCase())
  )
  if (typeMeta?.key) typeTokens.add(String(typeMeta.key).toUpperCase())
  if (typeMeta?.label) {
    for (const t of tokenizeNameForType(typeMeta.label)) typeTokens.add(t)
  }
  return tokenizeNameForType(name).filter((t) => t.length >= 3 && !typeTokens.has(t))
}

function sharesSignificantWord(queryTokens, candidateName, typeMeta) {
  if (!queryTokens.length) return false
  const cand = new Set(significantNameTokens(candidateName, typeMeta))
  return queryTokens.some((t) => cand.has(t))
}

function packSizeOk(wantedBaseQty, candValue, candUnit) {
  const candBase = quantityInBase(candValue, candUnit)
  if (wantedBaseQty == null || candBase == null) return false
  return candBase >= wantedBaseQty * 0.5 && candBase <= wantedBaseQty * 2
}

function median(nums) {
  if (!nums.length) return null
  const s = [...nums].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * Fallback: najniži €/kg (ili €/L) unutar product_type u lancu.
 * Samo ako točan barkod/naziv nije pronađen.
 * Filtri: cijena > 0, pakiranje 0,5×–2×, barem jedna zajednička značajna riječ,
 * €/jedinica u [med/5, 5×med]. Bez kandidata → null (nedostupno).
 */
async function resolveByTypeUnitPrice(item, chain) {
  const name = (item.name || '').trim()
  const typeKey = matchProductType(name)
  const qty = parseQuantityFromName(name)
  if (!typeKey || !qty) return null

  const wantedBase = baseUnitOf(qty.unit)
  if (!wantedBase) return null

  const typeMeta = getProductType(typeKey)
  if (!typeMeta) return null

  const wantedBaseQty = quantityInBase(qty.value, qty.unit)
  if (wantedBaseQty == null) return null

  const querySig = significantNameTokens(name, typeMeta)
  // Bez druge značajne riječi ne možemo razlikovati "ulje" od "ulje" — bolje nedostupno
  if (!querySig.length) return null

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
    if (!tokens.length) return null
    const orFilter = tokens.map((t) => `name.ilike.${t}%`).join(',')
    const byName = await supabase
      .from('regular_prices')
      .select(cols)
      .eq('chain', chain)
      .or(orFilter)
      .limit(100)
    if (byName.error) return null
    rows = byName.data || []
  }

  /** @type {{ row: object, perUnit: number, unitLabel: string, price: number }[]} */
  const cands = []
  for (const row of rows) {
    if (matchProductType(row.name) !== typeKey) continue
    if (!sharesSignificantWord(querySig, row.name, typeMeta)) continue

    let qv = row.quantity_value != null ? Number(row.quantity_value) : null
    let qu = row.quantity_unit || null
    if (qv == null || !qu) {
      const parsed = parseQuantityFromName(row.name)
      if (!parsed) continue
      qv = parsed.value
      qu = parsed.unit
    }
    if (baseUnitOf(qu) !== wantedBase) continue
    if (!packSizeOk(wantedBaseQty, qv, qu)) continue

    const price = parsePrice(row.special_price) ?? parsePrice(row.price)
    if (price == null || price <= 0) continue
    const per = pricePerBaseUnit(price, qv, qu)
    if (!per || per.perUnit <= 0) continue
    cands.push({ row, perUnit: per.perUnit, unitLabel: per.unitLabel, price })
  }

  if (!cands.length) return null

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
  const byType = await resolveByTypeUnitPrice(item, chain)
  if (byType) return byType

  return {
    available: false,
    price: null,
    originalPrice: null,
    priceSource: null,
    name,
    barcode,
    matchedBy: null,
  }
}

async function findSaleExact(name, chain) {
  const { data, error } = await supabase
    .from('active_deals')
    .select(
      'deal_id, product_id, name, store_name, price, original_price, discount_pct, image_url, category'
    )
    .eq('name', name)
    .order('price', { ascending: true })
    .limit(40)

  if (error) throw error
  for (const row of data || []) {
    if (chainFromStoreName(row.store_name) !== chain) continue
    const price = parsePrice(row.price)
    if (price == null) continue
    const originalPrice = parsePrice(row.original_price)
    return {
      name: row.name,
      price,
      originalPrice: originalPrice ?? price,
      deal: row,
    }
  }
  return null
}

/**
 * Primarni lanac: ukupna cijena + ušteda na akcijskim stavkama.
 * Ostali lanci: barkod → točan naziv → fallback najniži €/kg unutar product_type
 * (cijena > 0, pakiranje 0,5×–2×, zajednička značajna riječ, medijan [1/5, 5×]).
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

  return {
    selectedChain,
    primary: {
      chain: selectedChain,
      label: STORES.find((s) => s.id === selectedChain)?.label || selectedChain,
      total: primaryTotal,
      savings: primarySavings,
      lines: primaryLines,
      complete: primaryComplete,
      found: primaryFound,
    },
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
