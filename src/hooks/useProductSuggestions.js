import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

function safeSearchTerm(term) {
  return term.replace(/[%_]/g, '').trim()
}

function uniqueNames(rows, source, limit) {
  const seen = new Set()
  const out = []
  for (const row of rows || []) {
    const name = row.name?.trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ name, source })
    if (out.length >= limit) break
  }
  return out
}

export function useProductSuggestions(query) {
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const term = safeSearchTerm(query)
    if (term.length < 2) {
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
            .select('name')
            .ilike('name', pattern)
            .order('name')
            .limit(30),
          supabase
            .from('regular_prices')
            .select('name')
            .ilike('name', pattern)
            .order('name')
            .limit(30),
        ])

        if (saleRes.error) throw saleRes.error
        if (regularRes.error) throw regularRes.error

        const sale = uniqueNames(saleRes.data, 'sale', 8)
        const regular = uniqueNames(regularRes.data, 'regular', 8)
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
  }, [query])

  return { suggestions, loading }
}
