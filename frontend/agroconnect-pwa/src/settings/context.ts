import { createContext, useContext } from 'react'
import type { CountryCode } from '../domain/country'
import type { Place } from '../domain/weather'

export interface Settings {
  country: CountryCode
  /** Changing the country also moves the weather place to that country's default. */
  setCountry: (country: CountryCode) => void
  place: Place
  setPlace: (placeId: string) => void
}

export const SettingsContext = createContext<Settings | null>(null)

export function useSettings(): Settings {
  const value = useContext(SettingsContext)
  if (!value) throw new Error('useSettings must be used inside <SettingsProvider>')
  return value
}
