import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { adaptDeal } from '../lib/adapters'

export function useProximity({ radiusKm = 5 } = {}) {
  const [deals, setDeals]               = useState([])
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState(null)
  const [userLocation, setUserLocation] = useState(null)

  useEffect(() => {
    if (!navigator.geolocation) {
      setError('Geolokacija nije podržana u ovom pregledniku.')
      return
    }
    setLoading(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        })
      },
      () => {
        setError('Dopusti pristup lokaciji za prikaz akcija u blizini.')
        setLoading(false)
      }
    )
  }, [])

  useEffect(() => {
    if (!userLocation) return

    async function fetchNearbyDeals() {
      setLoading(true)
      setError(null)
      try {
        const { data, error } = await supabase.rpc('deals_near_me', {
          user_lat:  userLocation.lat,
          user_lng:  userLocation.lng,
          radius_km: radiusKm,
        })
        if (error) throw error
        setDeals((data || []).map(adaptDeal))
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    fetchNearbyDeals()
  }, [userLocation, radiusKm])

  return { deals, loading, error, userLocation }
}
