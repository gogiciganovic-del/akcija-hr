import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function usePriceHistory(productId) {
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!productId) return

    async function fetch() {
      const { data } = await supabase
        .from('price_history')
        .select(`
          price,
          original_price,
          discount_pct,
          valid_from,
          valid_until,
          stores (name, chain, city)
        `)
        .eq('product_id', productId)
        .order('valid_from', { ascending: false })
        .limit(20)

      setHistory(data || [])
      setLoading(false)
    }

    fetch()
  }, [productId])

  return { history, loading }
}
