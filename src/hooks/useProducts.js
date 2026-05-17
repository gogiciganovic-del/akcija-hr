import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { adaptDeal } from '../lib/adapters'

export function useProducts({ category, search, sortBy } = {}) {
  const [products, setProducts] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)

  useEffect(() => {
    async function fetchProducts() {
      setLoading(true)
      setError(null)

      try {
        let query = supabase.from('active_deals').select('*')

        if (category) query = query.eq('category', category)

        if (search) query = query.or(`name.ilike.%${search}%,brand.ilike.%${search}%`)

        if (sortBy === 'price_asc')  query = query.order('price', { ascending: true })
        else if (sortBy === 'price_desc') query = query.order('price', { ascending: false })
        else query = query.order('discount_pct', { ascending: false })

        const { data, error } = await query
        if (error) throw error
        setProducts((data || []).map(adaptDeal))
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    fetchProducts()
  }, [category, search, sortBy])

  return { products, loading, error }
}
