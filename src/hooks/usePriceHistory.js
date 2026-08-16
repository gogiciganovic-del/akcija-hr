import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Promjene redovne cijene za EAN + lanac (tablica price_history).
 * @param {string|null|undefined} barcode
 * @param {string|null|undefined} chain  npr. 'Lidl'
 */
export function usePriceHistory(barcode, chain) {
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const code = String(barcode || '').trim()
    const ch = String(chain || '').trim()
    if (!code || !ch) {
      setHistory([])
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)

    async function fetch() {
      const { data, error } = await supabase
        .from('price_history')
        .select('id, old_price, new_price, detected_at, chain, barcode')
        .eq('barcode', code)
        .eq('chain', ch)
        .order('detected_at', { ascending: false })
        .limit(12)

      if (cancelled) return
      if (error) {
        console.warn('price_history fetch:', error.message)
        setHistory([])
      } else {
        setHistory(data || [])
      }
      setLoading(false)
    }

    fetch()
    return () => {
      cancelled = true
    }
  }, [barcode, chain])

  return { history, loading }
}
