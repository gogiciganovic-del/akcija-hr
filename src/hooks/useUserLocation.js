import { useState, useEffect } from 'react'

const FALLBACK = 'Hrvatska'
const LOADING = 'Dohvaćam lokaciju...'

function formatLocation(address) {
  if (!address) return FALLBACK

  const city =
    address.city ||
    address.town ||
    address.village ||
    address.municipality ||
    address.suburb ||
    address.county

  const code = (address.country_code || 'hr').toUpperCase()

  if (city) return `${city}, ${code}`
  if (address.country) return address.country
  return FALLBACK
}

export function useUserLocation() {
  const [locationLabel, setLocationLabel] = useState(LOADING)
  const [coords, setCoords] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationLabel(FALLBACK)
      setCoords(null)
      setLoading(false)
      return
    }

    navigator.geolocation.getCurrentPosition(
      async ({ coords: c }) => {
        const next = { lat: c.latitude, lng: c.longitude }
        setCoords(next)
        try {
          const params = new URLSearchParams({
            lat: String(c.latitude),
            lon: String(c.longitude),
            format: 'json',
          })

          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?${params}`,
            {
              headers: {
                Accept: 'application/json',
                'Accept-Language': 'hr',
                'User-Agent': 'Cjenko/1.0 (akcije.hr)',
              },
            }
          )

          if (!res.ok) throw new Error('Geocoding failed')

          const data = await res.json()
          setLocationLabel(formatLocation(data.address))
        } catch {
          setLocationLabel(FALLBACK)
        } finally {
          setLoading(false)
        }
      },
      () => {
        setLocationLabel(FALLBACK)
        setCoords(null)
        setLoading(false)
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 }
    )
  }, [])

  return { locationLabel, coords, loading }
}
