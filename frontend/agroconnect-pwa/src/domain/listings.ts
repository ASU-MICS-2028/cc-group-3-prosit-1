import type { Currency } from './country'
import type { CropId } from './farmer'

export type ListingState = 'queued' | 'attention' | 'open' | 'closed'

export interface ListingView {
  id: string
  crop: CropId
  quantityKg: number
  pricePerKg: number
  currency: Currency
  community: string
  createdAt: string
  sellerName: string
  sellerPhone: string
  /** True for the caller's own listing, so the app can hide Call and Text on it. */
  mine: boolean
}

export const isListingList = (value: unknown): value is ListingView[] => Array.isArray(value)
