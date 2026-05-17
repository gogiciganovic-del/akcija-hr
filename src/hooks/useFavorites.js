import { useState, useCallback, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const STORAGE_KEY = 'akcije_favorites'

function loadLocalFavorites() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Map()
    return new Map(JSON.parse(raw))
  } catch {
    return new Map()
  }
}

function saveLocalFavorites(map) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...map.entries()]))
}

function rowsToMap(rows) {
  const map = new Map()
  for (const row of rows || []) {
    const product = row.product_data
    if (product?.id) map.set(product.id, product)
  }
  return map
}

export function useFavorites(user) {
  const [favorites, setFavorites] = useState(() => new Map())
  const [loading, setLoading] = useState(!!user)

  useEffect(() => {
    if (!user) {
      setFavorites(loadLocalFavorites())
      setLoading(false)
      return
    }

    let cancelled = false

    async function loadFromCloud() {
      setLoading(true)
      try {
        const { data, error } = await supabase
          .from('user_favorites')
          .select('deal_id, product_data')
          .eq('user_id', user.id)

        if (error) throw error

        const cloudMap = rowsToMap(data)
        const localMap = loadLocalFavorites()

        for (const [dealId, product] of localMap) {
          if (!cloudMap.has(dealId)) {
            const { error: insertErr } = await supabase.from('user_favorites').insert({
              user_id: user.id,
              deal_id: dealId,
              product_data: product,
            })
            if (!insertErr) cloudMap.set(dealId, product)
          }
        }

        if (localMap.size > 0) localStorage.removeItem(STORAGE_KEY)

        if (!cancelled) setFavorites(cloudMap)
      } catch (err) {
        console.error('Učitavanje favorita:', err.message)
        if (!cancelled) setFavorites(loadLocalFavorites())
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadFromCloud()
    return () => { cancelled = true }
  }, [user?.id])

  const isFav = useCallback((id) => favorites.has(id), [favorites])

  const toggle = useCallback(async (product) => {
    const id = product.id

    if (user) {
      if (favorites.has(id)) {
        setFavorites((prev) => {
          const next = new Map(prev)
          next.delete(id)
          return next
        })
        const { error } = await supabase
          .from('user_favorites')
          .delete()
          .eq('user_id', user.id)
          .eq('deal_id', id)
        if (error) {
          setFavorites((prev) => new Map(prev).set(id, product))
          console.error(error.message)
        }
      } else {
        setFavorites((prev) => new Map(prev).set(id, product))
        const { error } = await supabase.from('user_favorites').insert({
          user_id: user.id,
          deal_id: id,
          product_data: product,
        })
        if (error) {
          setFavorites((prev) => {
            const next = new Map(prev)
            next.delete(id)
            return next
          })
          console.error(error.message)
        }
      }
      return
    }

    setFavorites((prev) => {
      const next = new Map(prev)
      if (next.has(id)) next.delete(id)
      else next.set(id, product)
      saveLocalFavorites(next)
      return next
    })
  }, [user, favorites])

  const clear = useCallback(async () => {
    if (user) {
      const { error } = await supabase
        .from('user_favorites')
        .delete()
        .eq('user_id', user.id)
      if (error) {
        console.error(error.message)
        return
      }
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
    setFavorites(new Map())
  }, [user])

  return { favorites, isFav, toggle, clear, loading }
}
