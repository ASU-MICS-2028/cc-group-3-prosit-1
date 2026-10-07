import { useMemo, useState, type ReactNode } from 'react'
import { I18nContext, type I18n } from './context'
import { isAppLanguage, translate, type AppLanguage } from './translate'

const STORAGE_KEY = 'appLanguage'

function readSavedLanguage(): AppLanguage {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return isAppLanguage(saved) ? saved : 'en'
  } catch {
    return 'en'
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState(readSavedLanguage)

  const value = useMemo<I18n>(
    () => ({
      language,
      t: (key, vars) => translate(language, key, vars),
      setLanguage: (next) => {
        setLanguageState(next)
        try {
          localStorage.setItem(STORAGE_KEY, next)
        } catch {
          // Storage can be blocked; the choice just isn't remembered.
        }
      },
    }),
    [language],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
