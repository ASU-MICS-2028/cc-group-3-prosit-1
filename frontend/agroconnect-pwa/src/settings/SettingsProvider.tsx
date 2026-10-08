import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { COUNTRIES, type CountryCode } from '../domain/country'
import { HERE_ID, PLACES, defaultPlace, type Place } from '../domain/weather'
import { fetchPlaceName } from '../weather/placeNameApi'
import { SettingsContext, type LocationStatus, type Settings } from './context'

const COUNTRY_KEY = 'country'
const PLACE_KEY = 'place'
const LOCATION_KEY = 'myLocation'
const PERMISSION_DENIED = 1
const TEN_MINUTES_MS = 600_000

interface StoredLocation extends Pick<Place, 'latitude' | 'longitude'> {
  /** What the coordinates are called, looked up once online and kept for offline use. */
  name: string
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Storage can be blocked; the choice just isn't remembered.
  }
}

function readLocation(): StoredLocation | null {
  try {
    const parsed: unknown = JSON.parse(read(LOCATION_KEY) ?? 'null')
    if (typeof parsed !== 'object' || parsed === null) return null
    const { latitude, longitude, name } = parsed as Record<string, unknown>
    return typeof latitude === 'number' && typeof longitude === 'number' ? { latitude, longitude, name: typeof name === 'string' ? name : '' } : null
  } catch {
    return null
  }
}

/** Two decimals is about 1 km: enough for a forecast, too coarse to point at a farm. */
const roundCoordinate = (value: number) => Math.round(value * 100) / 100

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [country, setCountryState] = useState<CountryCode>(() => COUNTRIES.find((code) => code === read(COUNTRY_KEY)) ?? 'GH')
  const [placeId, setPlaceId] = useState(() => read(PLACE_KEY) || HERE_ID)
  const [location, setLocation] = useState(readLocation)
  const [locationStatus, setLocationStatus] = useState<LocationStatus>(() => (readLocation() ? 'ready' : 'idle'))

  const locate = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setLocationStatus('failed')
      return
    }
    setLocationStatus('working')
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const latitude = roundCoordinate(coords.latitude)
        const longitude = roundCoordinate(coords.longitude)
        const known = readLocation()
        const sameSpot = known?.latitude === latitude && known.longitude === longitude
        const next = { latitude, longitude, name: sameSpot ? known.name : '' }
        setLocation(next)
        write(LOCATION_KEY, JSON.stringify(next))
        setLocationStatus('ready')
        if (next.name) return
        fetchPlaceName(latitude, longitude)
          .then((name) => {
            if (!name) return
            const named = { ...next, name }
            setLocation(named)
            write(LOCATION_KEY, JSON.stringify(named))
          })
          .catch(() => {
            // Offline or the lookup failed: the forecast still works, the place just stays unnamed.
          })
      },
      (error) => setLocationStatus(error.code === PERMISSION_DENIED ? 'denied' : 'failed'),
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: TEN_MINUTES_MS },
    )
  }, [])

  const value = useMemo<Settings>(() => {
    const wantsHere = placeId === HERE_ID
    const town = PLACES.find((place) => place.id === placeId && place.country === country)
    const here: Place | null = wantsHere && location ? { id: HERE_ID, country, ...location } : null
    return {
      country,
      setCountry: (next) => {
        setCountryState(next)
        setPlaceId(defaultPlace(next).id)
        write(COUNTRY_KEY, next)
        write(PLACE_KEY, defaultPlace(next).id)
      },
      place: here ?? town ?? defaultPlace(country),
      setPlace: (id) => {
        setPlaceId(id)
        write(PLACE_KEY, id)
      },
      followsLocation: wantsHere,
      locationStatus,
      locate,
    }
  }, [country, placeId, location, locationStatus, locate])

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}
