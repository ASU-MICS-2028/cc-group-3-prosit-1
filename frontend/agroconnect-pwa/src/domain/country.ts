import type { CropId } from './farmer'

export const COUNTRIES = ['GH', 'NG', 'KE'] as const
export type CountryCode = (typeof COUNTRIES)[number]

interface CountryInfo {
  currency: 'GHS' | 'NGN' | 'KES'
  symbol: string
}

export const COUNTRY_INFO: Record<CountryCode, CountryInfo> = {
  GH: { currency: 'GHS', symbol: '₵' },
  NG: { currency: 'NGN', symbol: '₦' },
  KE: { currency: 'KES', symbol: 'KSh' },
}

export function formatCurrency(amount: number, currency: Currency): string {
  const text = amount.toLocaleString('en', { minimumFractionDigits: amount % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })
  return `${CURRENCY_SYMBOL[currency]} ${text}`
}

export const formatMoney = (amount: number, country: CountryCode): string => formatCurrency(amount, COUNTRY_INFO[country].currency)

export type Currency = CountryInfo['currency']

export const CURRENCY_SYMBOL: Record<Currency, string> = { GHS: '₵', NGN: '₦', KES: 'KSh' }

export interface PriceEntry {
  price: number
  /** Percent change since last week. */
  change: number
}

export type PriceTable = Record<CountryCode, Record<CropId, PriceEntry>>
