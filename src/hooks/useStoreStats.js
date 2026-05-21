import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function useStoreStats(chain) {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!chain) {
      setStats(null)
      setLoading(false)
      return
    }

    let cancelled = false

    async function fetchStats() {
      setLoading(true)
      try {
        const { data, error } = await supabase
          .from('active_deals')
          .select('discount_pct')
          .ilike('store_name', `${chain}%`)

        if (error) throw error

        const rows = data || []
        const total = rows.length
        const hotCount = rows.filter((r) => r.discount_pct >= 50).length
        const avgDiscount = total
          ? Math.round(rows.reduce((sum, r) => sum + r.discount_pct, 0) / total)
          : 0

        if (!cancelled) {
          setStats({ total, hotCount, avgDiscount })
        }
      } catch {
        if (!cancelled) setStats({ total: 0, hotCount: 0, avgDiscount: 0 })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchStats()
    return () => { cancelled = true }
  }, [chain])

  return { stats, loading }
}
