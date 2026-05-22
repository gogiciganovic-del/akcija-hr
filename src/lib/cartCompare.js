import { supabase } from './supabase'
import { STORES, chainFromStoreName } from './constants'

/**
 * Za svaki artikl u košarici pronađi najjeftiniju cijenu po lancu i zbroji ukupno.
 */
export async function compareCart(cartItems) {
  if (!cartItems.length) return { rankings: [], unmatched: [] }

  const chainTotals = Object.fromEntries(
    STORES.map((s) => [s.id, { total: 0, found: 0, label: s.label }])
  )
  const unmatched = []

  for (const item of cartItems) {
    const term = item.name.trim()
    const { data, error } = await supabase
      .from('active_deals')
      .select('name, store_name, price')
      .ilike('name', `%${term}%`)
      .order('price', { ascending: true })

    if (error) throw error

    if (!data?.length) {
      unmatched.push(term)
      continue
    }

    const cheapestPerChain = {}
    for (const deal of data) {
      const chain = chainFromStoreName(deal.store_name)
      if (!chain) continue
      const price = parseFloat(deal.price)
      if (cheapestPerChain[chain] == null || price < cheapestPerChain[chain]) {
        cheapestPerChain[chain] = price
      }
    }

    for (const [chain, price] of Object.entries(cheapestPerChain)) {
      chainTotals[chain].total += price
      chainTotals[chain].found += 1
    }
  }

  const itemCount = cartItems.length

  const rankings = STORES.map((s) => ({
    chain: s.id,
    label: s.label,
    total: chainTotals[s.id].total,
    found: chainTotals[s.id].found,
    complete: chainTotals[s.id].found === itemCount,
  }))
    .filter((r) => r.found > 0)
    .sort((a, b) => {
      if (a.complete !== b.complete) return a.complete ? -1 : 1
      return a.total - b.total
    })

  return { rankings, unmatched }
}
