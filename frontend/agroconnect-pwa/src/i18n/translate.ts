import dag from './dag.json'
import ee from './ee.json'
import en from './en.json'
import tw from './tw.json'

export type TranslationKey = keyof typeof en
export type TranslationVars = Record<string, string | number>
export type AppLanguage = 'en' | 'tw' | 'ee' | 'dag'

type Dictionary = Partial<Record<TranslationKey, string>>

const dictionaries: Record<AppLanguage, Dictionary> = { en, tw, ee, dag }

export const APP_LANGUAGES = Object.keys(dictionaries) as AppLanguage[]

export function isAppLanguage(value: string | null): value is AppLanguage {
  return value !== null && value in dictionaries
}

/** Falls back to English, then to the key itself, so a missing string is never blank. */
export function translate(language: AppLanguage, key: TranslationKey, vars: TranslationVars = {}): string {
  const text = dictionaries[language][key] ?? en[key]
  return text.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? ''))
}
