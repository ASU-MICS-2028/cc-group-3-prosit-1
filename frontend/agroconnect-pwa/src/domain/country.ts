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

export function formatMoney(amount: number, country: CountryCode): string {
  const { symbol } = COUNTRY_INFO[country]
  const text = amount.toLocaleString('en', { minimumFractionDigits: amount % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })
  return `${symbol} ${text}`
}

export type PriceTable = Record<CountryCode, Record<CropId, number>>
