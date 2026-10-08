import { createContext, useContext } from 'react'
import type { CountryCode } from '../domain/country'
import type { Place } from '../domain/weather'

export interface Settings {
  country: CountryCode
  /** Changing the country also moves the weather place to that country's default. */
  setCountry: (country: CountryCode) => void
  /** Where the weather is for: the phone's location by default, or a town the user picked. */
  place: Place
  /** Pass HERE_ID to follow the phone's location again. */
  setPlace: (placeId: string) => void
  followsLocation: boolean
  locationStatus: LocationStatus
  /** Asks the phone where it is. Falls back quietly to the last known place or the country's default town. */
  locate: () => void
}

export type LocationStatus = 'idle' | 'working' | 'ready' | 'denied' | 'failed'

export const SettingsContext = createContext<Settings | null>(null)

export function useSettings(): Settings {
  const value = useContext(SettingsContext)
  if (!value) throw new Error('useSettings must be used inside <SettingsProvider>')
  return value
}
