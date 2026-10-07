import { useMemo, useState, type ReactNode } from 'react'
import { COUNTRIES, type CountryCode } from '../domain/country'
import { SettingsContext, type Settings } from './context'

const STORAGE_KEY = 'country'

function readSavedCountry(): CountryCode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return COUNTRIES.find((code) => code === saved) ?? 'GH'
  } catch {
    return 'GH'
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [country, setCountryState] = useState(readSavedCountry)

  const value = useMemo<Settings>(
    () => ({
      country,
      setCountry: (next) => {
        setCountryState(next)
        try {
          localStorage.setItem(STORAGE_KEY, next)
        } catch {
          // Storage can be blocked; the choice just isn't remembered.
        }
      },
    }),
    [country],
  )

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}
