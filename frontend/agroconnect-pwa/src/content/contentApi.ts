import { authedJson } from '../auth/authedRequest'
import { ADMIN_URL } from '../config'
import type { CountryCode } from '../domain/country'
import type { CropId } from '../domain/farmer'
import { jsonPost } from '../sync/send'

/** docs/CONTENT-CONTRACT.md */
export interface MarketPriceItem {
  crop: CropId
  price: number
  change: number
  recordedOn: string
}

export interface MarketPrices {
  country: CountryCode
  updatedOn: string | null
  items: MarketPriceItem[]
}

export interface AdviceItem {
  id: string
  crop: CropId
  title: string
  body: string
  createdAt: string
  byName: string
}

export const isMarketPrices = (value: unknown): value is MarketPrices =>
  typeof value === 'object' && value !== null && Array.isArray((value as MarketPrices).items) && typeof (value as MarketPrices).country === 'string'

export const isAdviceList = (value: unknown): value is { items: AdviceItem[] } =>
  typeof value === 'object' && value !== null && Array.isArray((value as { items: unknown }).items)

export const fetchMarketPrices = (country: CountryCode) =>
  authedJson<MarketPrices>(`${ADMIN_URL}/market-prices?country=${encodeURIComponent(country)}`)

export const fetchAdvice = () => authedJson<{ items: AdviceItem[] }>(`${ADMIN_URL}/advice`)

export const recordMarketPrice = (input: { country: CountryCode; crop: CropId; pricePerKg: number; recordedOn?: string }) =>
  authedJson<{ price: number; recordedOn: string }>(`${ADMIN_URL}/admin/market-prices`, jsonPost(input))

export const publishAdvice = (input: { crop: CropId; title: string; body: string }) =>
  authedJson<{ id: string }>(`${ADMIN_URL}/admin/advice`, jsonPost(input))

export const archiveAdvice = (id: string) =>
  authedJson<{ id: string }>(`${ADMIN_URL}/admin/advice/${encodeURIComponent(id)}/archive`, jsonPost({}))
