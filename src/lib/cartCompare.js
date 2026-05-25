import { supabase } from './supabase'
import { STORES, chainFromStoreName } from './constants'

function dealImage(name, imageUrl) {
  return imageUrl || `https://placehold.co/80x80/0d1f3a/ffffff?text=${encodeURIComponent(name.slice(0, 8))}`
}

function safeSearchTerm(term) {
  return term.replace(/[%_]/g, '').trim()
}

/** Rang: kompletna košarica → više stavki → niža ukupna cijena */
function compareRankings(a, b) {
  if (a.complete !== b.complete) return a.complete ? -1 : 1
  if (a.found !== b.found) return b.found - a.found
  return a.total - b.total
}

async function searchCheapestPerChain(term) {
  const { data, error } = await supabase
    .from('active_deals')
    .select('name, store_name, price, image_url')
    .ilike('name', `%${term}%`)
    .order('price', { ascending: true })
    .limit(1000)

  if (error) throw error
  if (!data?.length) return null

  const cheapestPerChain = {}
  for (const deal of data) {
    const chain = chainFromStoreName(deal.store_name)
    if (!chain) continue

    const price = parseFloat(deal.price)
    if (Number.isNaN(price)) continue

    const prev = cheapestPerChain[chain]
    if (!prev || price < prev.price) {
      cheapestPerChain[chain] = {
        price,
        name: deal.name,
        image_url: deal.image_url,
        image: dealImage(deal.name, deal.image_url),
      }
    }
  }

  return Object.keys(cheapestPerChain).length ? cheapestPerChain : null
}

/**
 * Košarica: za svaku stavku ILIKE '%riječ%', po trgovini najjeftiniji match, zbroj ukupno.
 */
export async function compareCart(cartItems) {
  if (!cartItems.length) return { rankings: [], unmatched: [], itemCount: 0 }

  const itemCount = cartItems.length
  const chainTotals = Object.fromEntries(
    STORES.map((s) => [s.id, { total: 0, found: 0, label: s.label, items: [] }])
  )
  const unmatched = []

  const searches = await Promise.all(
    cartItems.map(async (item) => {
      const term = safeSearchTerm(item.name)
      if (!term) return { term: item.name.trim(), matches: null }
      const matches = await searchCheapestPerChain(term)
      return { term, matches }
    })
  )

  for (const { term, matches } of searches) {
    if (!matches) {
      unmatched.push(term)
      continue
    }

    for (const [chain, match] of Object.entries(matches)) {
      chainTotals[chain].total += match.price
      chainTotals[chain].found += 1
      chainTotals[chain].items.push({
        cartName: term,
        name: match.name,
        image_url: match.image_url,
        image: match.image,
        price: match.price,
      })
    }
  }

  const rankings = STORES.map((s) => ({
    chain: s.id,
    label: s.label,
    total: Math.round(chainTotals[s.id].total * 100) / 100,
    found: chainTotals[s.id].found,
    complete: chainTotals[s.id].found === itemCount,
    items: chainTotals[s.id].items,
  }))
    .filter((r) => r.found > 0)
    .sort(compareRankings)
    .map((r, i) => ({ ...r, isBest: i === 0 }))

  return { rankings, unmatched, itemCount }
}
