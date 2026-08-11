import { useState, useCallback } from 'react'

/** Cache nakon uspješnog requesta — bez ponovnog popup-a. */
let cached = { coords: null, label: null }

function formatLocation(address) {
  if (!address) return null

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
  return null
}

/**
 * Lokacija na zahtjev — NE traži dozvolu pri mountanju.
 * @returns {{ locationLabel: string|null, coords: {lat:number,lng:number}|null, loading: boolean, requestLocation: () => Promise<{lat:number,lng:number}|null> }}
 */
export function useUserLocation() {
  const [locationLabel, setLocationLabel] = useState(cached.label)
  const [coords, setCoords] = useState(cached.coords)
  const [loading, setLoading] = useState(false)

  const requestLocation = useCallback(() => {
    if (cached.coords) {
      setCoords(cached.coords)
      setLocationLabel(cached.label)
      return Promise.resolve(cached.coords)
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return Promise.resolve(null)
    }

    setLoading(true)
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        async ({ coords: c }) => {
          const next = { lat: c.latitude, lng: c.longitude }
          let label = null
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
                  'User-Agent': 'Cjenko/1.0 (https://cjenko.app)',
                },
              }
            )
            if (res.ok) {
              const data = await res.json()
              label = formatLocation(data.address)
            }
          } catch {
            // reverse geocode optional — Maps radi i bez labela
          }

          cached = { coords: next, label }
          setCoords(next)
          setLocationLabel(label)
          setLoading(false)
          resolve(next)
        },
        () => {
          setLoading(false)
          resolve(null)
        },
        { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 }
      )
    })
  }, [])

  return { locationLabel, coords, loading, requestLocation }
}
