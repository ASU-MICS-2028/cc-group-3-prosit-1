import { createContext, useContext } from 'react'
import type { AppLanguage, TranslationKey, TranslationVars } from './translate'

export interface I18n {
  t: (key: TranslationKey, vars?: TranslationVars) => string
  language: AppLanguage
  setLanguage: (language: AppLanguage) => void
}

export const I18nContext = createContext<I18n | null>(null)

export function useT(): I18n {
  const value = useContext(I18nContext)
  if (!value) throw new Error('useT must be used inside <I18nProvider>')
  return value
}
