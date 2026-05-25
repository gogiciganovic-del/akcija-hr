import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

function safeSearchTerm(term) {
  return term.replace(/[%_]/g, '').trim()
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
        const { data, error } = await supabase
          .from('active_deals')
          .select('name')
          .ilike('name', `%${term}%`)
          .order('name')
          .limit(30)

        if (error) throw error

        const seen = new Set()
        const names = []
        for (const row of data || []) {
          const n = row.name?.trim()
          if (!n || seen.has(n.toLowerCase())) continue
          seen.add(n.toLowerCase())
          names.push(n)
          if (names.length >= 8) break
        }

        if (!cancelled) setSuggestions(names)
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
