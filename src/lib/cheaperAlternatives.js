import { supabase } from './supabase'
import { chainFromStoreName } from './constants'
import { matchProductType } from './productTypes'
import {
  parseQuantityFromName,
  pricePerBaseUnit,
  formatPricePerUnit,
} from './quantityParse'
import { normalizeImageUrl } from './productImage'

function parsePrice(v) {
  const n = parseFloat(v)
  return Number.isNaN(n) ? null : n
}

function median(nums) {
  if (!nums.length) return null
  const s = [...nums].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function stripDealNameSuffix(name) {
  return String(name || '')
    .replace(/\s+akcija\s+u\s+trgovini\s+.+$/i, '')
    .trim()
}

function normalizeNameKey(name) {
  return stripDealNameSuffix(name).toLowerCase().replace(/\s+/g, ' ').trim()
}

function baseUnitOf(unit) {
  if (unit === 'g' || unit === 'kg') return 'kg'
  if (unit === 'ml' || unit === 'L') return 'L'
  if (unit === 'kom') return 'kom'
  return null
}

/**
 * Do 4 jeftinija (po €/baznoj jedinici) proizvoda istog tipa u istom lancu.
 * Sanity: price > 0, pojas medijan/5 … 5×medijan. Bez cross-chain.
 *
 * @param {{ name?: string, barcode?: string|null, chain?: string|null, salePrice?: number, price?: number }} product
 * @returns {Promise<Array<{ name: string, barcode: string|null, chain: string, price: number, perUnit: number, unitLabel: string, perUnitLabel: string, imageUrl: string|null }>>}
 */
export async function fetchCheaperAlternatives(product) {
  const name = String(product?.name || '').trim()
  const chain = product?.chain || null
  if (!name || !chain) return []

  const typeKey = product.product_type || product.productType || matchProductType(name)
  const qty = parseQuantityFromName(name)
  if (!typeKey || !qty || !baseUnitOf(qty.unit)) return []

  const currentPrice = parsePrice(product.salePrice ?? product.price)
  if (currentPrice == null || currentPrice <= 0) return []

  const currentPer = pricePerBaseUnit(currentPrice, qty.value, qty.unit)
  if (!currentPer || currentPer.perUnit <= 0) return []

  const wantedBase = currentPer.unitLabel
  const selfBarcode = String(product.barcode || '').trim()
  const selfNameKey = normalizeNameKey(name)

  const cols =
    'barcode, name, brand, chain, price, special_price, product_type, quantity_value, quantity_unit'

  const { data, error } = await supabase
    .from('regular_prices')
    .select(cols)
    .eq('chain', chain)
    .eq('product_type', typeKey)
    .limit(120)

  if (error || !data?.length) return []

  /** @type {{ name: string, barcode: string|null, chain: string, price: number, perUnit: number, unitLabel: string }[]} */
  const cands = []
  for (const row of data) {
    const rowName = String(row.name || '').trim()
    if (!rowName) continue
    if (matchProductType(rowName) !== typeKey) continue

    const bc = String(row.barcode || '').trim()
    if (selfBarcode && bc && bc === selfBarcode) continue
    if (normalizeNameKey(rowName) === selfNameKey) continue

    let qv = row.quantity_value != null ? Number(row.quantity_value) : null
    let qu = row.quantity_unit || null
    if (qv == null || !qu) {
      const parsed = parseQuantityFromName(rowName)
      if (!parsed) continue
      qv = parsed.value
      qu = parsed.unit
    }
    if (baseUnitOf(qu) !== wantedBase) continue

    const price = parsePrice(row.special_price) ?? parsePrice(row.price)
    if (price == null || price <= 0) continue
    const per = pricePerBaseUnit(price, qv, qu)
    if (!per || per.perUnit <= 0) continue
    if (per.unitLabel !== wantedBase) continue

    cands.push({
      name: rowName,
      barcode: bc || null,
      chain,
      price,
      perUnit: per.perUnit,
      unitLabel: per.unitLabel,
    })
  }

  if (!cands.length) return []

  const med = median(cands.map((c) => c.perUnit))
  const band =
    med != null && med > 0
      ? cands.filter((c) => c.perUnit >= med / 5 && c.perUnit <= 5 * med)
      : cands

  const cheaper = band
    .filter((c) => c.perUnit < currentPer.perUnit)
    .sort((a, b) => a.perUnit - b.perUnit)
    .slice(0, 4)

  if (!cheaper.length) return []

  const images = await fetchImagesForRows(cheaper, chain)
  return cheaper.map((c) => ({
    ...c,
    perUnitLabel: formatPricePerUnit(c.perUnit, c.unitLabel),
    imageUrl: images.get(`${c.barcode || ''}|${normalizeNameKey(c.name)}`) || null,
  }))
}

async function fetchImagesForRows(rows, chain) {
  const map = new Map()
  const barcodes = [
    ...new Set(rows.map((r) => r.barcode).filter((b) => b && String(b).length >= 8)),
  ]

  const ingest = (dealRows) => {
    for (const row of dealRows || []) {
      const url = normalizeImageUrl(row.image_url)
      if (!url) continue
      if (chainFromStoreName(row.store_name) !== chain) continue
      const bc = String(row.barcode || '').trim()
      const keyName = normalizeNameKey(row.name)
      if (bc) map.set(`${bc}|${keyName}`, url)
      if (keyName) {
        // Lookup by name-only key for enrich below
        if (!map.has(`|${keyName}`)) map.set(`|${keyName}`, url)
      }
    }
  }

  if (barcodes.length) {
    const { data } = await supabase
      .from('active_deals')
      .select('barcode, name, store_name, image_url')
      .in('barcode', barcodes)
      .not('image_url', 'is', null)
    ingest(data)
  }

  // Page deals for this chain and match stripped names (letak-sufiks)
  const { data: deals } = await supabase
    .from('active_deals')
    .select('barcode, name, store_name, image_url')
    .ilike('store_name', `%${chain}%`)
    .not('image_url', 'is', null)
    .limit(400)
  ingest(deals)

  const out = new Map()
  for (const r of rows) {
    const nk = normalizeNameKey(r.name)
    const bc = r.barcode || ''
    const url =
      (bc && map.get(`${bc}|${nk}`)) ||
      map.get(`|${nk}`) ||
      null
    out.set(`${bc}|${nk}`, url)
  }
  return out
}
