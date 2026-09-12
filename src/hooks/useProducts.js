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
    image_url,
    barcode
  ),
  stores!inner (
    name
  )
`

function escapeIlike(s) {
  return String(s || '').replace(/[%_,]/g, '')
}

function applySort(query, sortBy) {
  if (sortBy === 'price_asc') return query.order('price', { ascending: true })
  if (sortBy === 'price_desc') return query.order('price', { ascending: false })
  return query.order('discount_pct', { ascending: false })
}

export function useProducts({ category, search, sortBy, chain, enabled = true } = {}) {
  const [products, setProducts] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)

  useEffect(() => {
    if (!enabled) {
      setProducts([])
      setLoading(false)
      setError(null)
      return
    }

    let cancelled = false

    async function fetchProducts() {
      setLoading(true)
      setError(null)

      try {
        const needle = escapeIlike(search).trim()

        // Pretraga po imenu: active_deals (name/brand kolone).
        // deals + products.name.or() često vrati sve (do 1000) ili padne na fallback.
        if (needle) {
          let fallback = supabase.from('active_deals').select('*')
          if (category) fallback = fallback.eq('category', category)
          if (chain) fallback = fallback.ilike('store_name', `${chain}%`)
          fallback = fallback.or(`name.ilike.%${needle}%,brand.ilike.%${needle}%`)
          fallback = applySort(fallback, sortBy)

          const { data: viewData, error: viewError } = await fallback
          if (viewError) throw viewError
          if (cancelled) return
          setProducts((viewData || []).map(adaptDeal))
          return
        }

        let query = supabase
          .from('deals')
          .select(DEALS_SELECT)
          .eq('is_active', true)
          .gt('valid_until', new Date().toISOString())

        if (category) query = query.eq('products.category', category)
        if (chain) query = query.ilike('stores.name', `${chain}%`)
        query = applySort(query, sortBy)

        const { data, error: dealsError } = await query

        if (dealsError) {
          let fallback = supabase.from('active_deals').select('*')
          if (category) fallback = fallback.eq('category', category)
          if (chain) fallback = fallback.ilike('store_name', `${chain}%`)
          fallback = applySort(fallback, sortBy)

          const { data: viewData, error: viewError } = await fallback
          if (viewError) throw viewError
          if (cancelled) return
          setProducts((viewData || []).map(adaptDeal))
          return
        }

        if (cancelled) return
        setProducts((data || []).map(adaptDealRow))
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchProducts()
    return () => {
      cancelled = true
    }
  }, [category, search, sortBy, chain, enabled])

  return { products, loading, error }
}
