import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { chainFromStoreName } from '../lib/constants'

function safeSearchTerm(term) {
  return term.replace(/[%_]/g, '').trim()
}

/**
 * Autocomplete za košaricu — samo unutar odabranog lanca.
 * @param {string} query
 * @param {string | null} chain  STORES.id npr. 'Lidl'
 * @returns {{ suggestions: Array, loading: boolean }}
 *
 * Stavka prijedloga:
 * { name, source, price, originalPrice, barcode, brand, category, image_url, product_id, store_name }
 */
export function useProductSuggestions(query, chain = null) {
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const term = safeSearchTerm(query)
    if (!chain || term.length < 2) {
      setSuggestions([])
      setLoading(false)
      return
    }

    let cancelled = false
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const pattern = `%${term}%`

        const [saleRes, regularRes] = await Promise.all([
          supabase
            .from('active_deals')
            .select(
              'name, price, original_price, discount_pct, store_name, image_url, product_id, brand, category'
            )
            .ilike('name', pattern)
            .order('price', { ascending: true })
            .limit(80),
          supabase
            .from('regular_prices')
            .select('name, price, special_price, barcode, brand, category, chain')
            .eq('chain', chain)
            .ilike('name', pattern)
            .order('price', { ascending: true })
            .limit(30),
        ])

        if (saleRes.error) throw saleRes.error
        if (regularRes.error) throw regularRes.error

        const saleSeen = new Set()
        const sale = []
        for (const row of saleRes.data || []) {
          if (chainFromStoreName(row.store_name) !== chain) continue
          const name = row.name?.trim()
          if (!name) continue
          const key = name.toLowerCase()
          if (saleSeen.has(key)) continue
          saleSeen.add(key)
          const price = parseFloat(row.price)
          const originalPrice = parseFloat(row.original_price)
          sale.push({
            name,
            source: 'sale',
            price,
            originalPrice: Number.isNaN(originalPrice) ? price : originalPrice,
            barcode: null,
            brand: row.brand || null,
            category: row.category || null,
            image_url: row.image_url || null,
            product_id: row.product_id || null,
            store_name: row.store_name || chain,
          })
          if (sale.length >= 8) break
        }

        const regularSeen = new Set()
        const regular = []
        for (const row of regularRes.data || []) {
          const name = row.name?.trim()
          if (!name) continue
          const key = name.toLowerCase()
          // Ako već imamo isti naziv kao akciju, i dalje ponudi REDOVNU kao odvojenu opciju
          if (regularSeen.has(key)) continue
          regularSeen.add(key)
          const price = parseFloat(row.price)
          regular.push({
            name,
            source: 'regular',
            price,
            originalPrice: price,
            barcode: row.barcode || null,
            brand: row.brand || null,
            category: row.category || null,
            image_url: null,
            product_id: null,
            store_name: chain,
          })
          if (regular.length >= 8) break
        }

        const merged = [...sale, ...regular].slice(0, 8)
        if (!cancelled) setSuggestions(merged)
      } catch {
        if (!cancelled) setSuggestions([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 250)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, chain])

  return { suggestions, loading }
}
