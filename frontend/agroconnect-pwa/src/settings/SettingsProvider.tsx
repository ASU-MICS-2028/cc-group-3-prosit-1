import { useMemo, useState, type ReactNode } from 'react'
import { COUNTRIES, type CountryCode } from '../domain/country'
import { PLACES, defaultPlace } from '../domain/weather'
import { SettingsContext, type Settings } from './context'

const COUNTRY_KEY = 'country'
const PLACE_KEY = 'place'

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

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [country, setCountryState] = useState<CountryCode>(() => COUNTRIES.find((code) => code === read(COUNTRY_KEY)) ?? 'GH')
  const [placeId, setPlaceId] = useState(() => read(PLACE_KEY) ?? '')

  const value = useMemo<Settings>(
    () => ({
      country,
      setCountry: (next) => {
        setCountryState(next)
        setPlaceId(defaultPlace(next).id)
        write(COUNTRY_KEY, next)
        write(PLACE_KEY, defaultPlace(next).id)
      },
      place: PLACES.find((place) => place.id === placeId && place.country === country) ?? defaultPlace(country),
      setPlace: (id) => {
        setPlaceId(id)
        write(PLACE_KEY, id)
      },
    }),
    [country, placeId],
  )

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}
