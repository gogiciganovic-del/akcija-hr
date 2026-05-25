import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { adaptDeal, adaptDealRow } from '../lib/adapters'

const DEALS_SELECT = `
  id,
  product_id,
  price,
  original_price,
  discount_pct,
  valid_from,
  valid_until,
  created_at,
  scraped_at,
  products!inner (
    name,
    brand,
    category,
    image_url
  ),
  stores!inner (
    name
  )
`

export function useProducts({ category, search, sortBy, chain } = {}) {
  const [products, setProducts] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)

  useEffect(() => {
    async function fetchProducts() {
      setLoading(true)
      setError(null)

      try {
        let query = supabase
          .from('deals')
          .select(DEALS_SELECT)
          .eq('is_active', true)
          .gt('valid_until', new Date().toISOString())

        if (category) query = query.eq('products.category', category)

        if (chain) query = query.ilike('stores.name', `${chain}%`)

        if (search) {
          query = query.or(
            `products.name.ilike.%${search}%,products.brand.ilike.%${search}%`
          )
        }

        if (sortBy === 'price_asc') query = query.order('price', { ascending: true })
        else if (sortBy === 'price_desc') query = query.order('price', { ascending: false })
        else query = query.order('discount_pct', { ascending: false })

        const { data, error: dealsError } = await query

        if (dealsError) {
          let fallback = supabase.from('active_deals').select('*')
          if (category) fallback = fallback.eq('category', category)
          if (chain) fallback = fallback.ilike('store_name', `${chain}%`)
          if (search) {
            fallback = fallback.or(`name.ilike.%${search}%,brand.ilike.%${search}%`)
          }
          if (sortBy === 'price_asc') fallback = fallback.order('price', { ascending: true })
          else if (sortBy === 'price_desc') fallback = fallback.order('price', { ascending: false })
          else fallback = fallback.order('discount_pct', { ascending: false })

          const { data: viewData, error: viewError } = await fallback
          if (viewError) throw viewError
          setProducts((viewData || []).map(adaptDeal))
          return
        }

        setProducts((data || []).map(adaptDealRow))
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    fetchProducts()
  }, [category, search, sortBy, chain])

  return { products, loading, error }
}
