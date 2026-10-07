import { createContext, useContext } from 'react'
import type { CountryCode } from '../domain/country'

export interface Settings {
  country: CountryCode
  setCountry: (country: CountryCode) => void
}

export const SettingsContext = createContext<Settings | null>(null)

export function useSettings(): Settings {
  const value = useContext(SettingsContext)
  if (!value) throw new Error('useSettings must be used inside <SettingsProvider>')
  return value
}
