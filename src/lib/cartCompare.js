import { supabase } from './supabase'
import { STORES, chainFromStoreName } from './constants'

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

/**
 * Nađi cijenu artikla kod jednog lanca.
 * Prioritet: barkod → točan naziv; unutar toga akcija pa redovna.
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
    return { available: false, price: null, originalPrice: null, priceSource: null, name, barcode, matchedBy: null }
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
 * Ostali lanci: ista košarica po barkodu/točnom nazivu, ili "nedostupno".
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

      return {
        chain,
        label: STORES.find((s) => s.id === chain)?.label || chain,
        total,
        missing,
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

  return {
    selectedChain,
    primary: {
      chain: selectedChain,
      label: STORES.find((s) => s.id === selectedChain)?.label || selectedChain,
      total: primaryTotal,
      savings: primarySavings,
      lines: primaryLines,
      complete: primaryComplete,
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
