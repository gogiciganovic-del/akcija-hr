import { useState, useCallback, useEffect } from 'react'
import { trackFavoritDodan } from '../lib/usageEvents'

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

export function useFavorites() {
  const [favorites, setFavorites] = useState(() => new Map())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setFavorites(loadLocalFavorites())
    setLoading(false)
  }, [])

  const isFav = useCallback((id) => favorites.has(id), [favorites])

  const toggle = useCallback((product) => {
    const id = product.id
    const adding = !favorites.has(id)
    setFavorites((prev) => {
      const next = new Map(prev)
      if (next.has(id)) next.delete(id)
      else next.set(id, product)
      saveLocalFavorites(next)
      return next
    })
    if (adding) trackFavoritDodan()
  }, [favorites])

  const clear = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setFavorites(new Map())
  }, [])

  return { favorites, isFav, toggle, clear, loading }
}
