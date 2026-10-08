import { useCallback } from 'react'
import { SAMPLE_ADVICE, type AdviceCard } from '../data/sampleAdvice'
import { SAMPLE_PRICES, SAMPLE_PRICES_UPDATED } from '../data/samplePrices'
import type { CountryCode } from '../domain/country'
import { CROP_IDS, type CropId } from '../domain/farmer'
import { useCachedRemote } from '../hooks/useCachedRemote'
import type { RemoteState } from '../hooks/useRemote'
import { fetchAdvice, fetchMarketPrices, isAdviceList, isMarketPrices, type AdviceItem, type MarketPrices } from './contentApi'

export interface PriceRow {
  crop: CropId
  price: number
  change: number
}

export interface PricesView {
  rows: PriceRow[]
  updatedOn: string | null
  /** True when these are the built-in samples, shown with a "Sample" label. */
  sample: boolean
}

const samplePrices = (country: CountryCode): PricesView => ({
  rows: CROP_IDS.map((crop) => ({ crop, ...SAMPLE_PRICES[country][crop] })),
  updatedOn: SAMPLE_PRICES_UPDATED,
  sample: true,
})

/** Live prices once anything has been entered for the country; the labelled samples until then, or with no copy at all. */
export function choosePrices(state: RemoteState<MarketPrices>, country: CountryCode): PricesView | null {
  if (state.status === 'loading') return null
  if (state.status === 'ready' && state.data.items.length > 0) {
    return { rows: state.data.items.map(({ crop, price, change }) => ({ crop, price, change })), updatedOn: state.data.updatedOn, sample: false }
  }
  return samplePrices(country)
}

export function chooseAdvice(state: RemoteState<{ items: AdviceItem[] }>): { cards: readonly AdviceCard[]; sample: boolean } | null {
  if (state.status === 'loading') return null
  if (state.status === 'ready' && state.data.items.length > 0) return { cards: state.data.items, sample: false }
  return { cards: SAMPLE_ADVICE, sample: true }
}

export function useMarketPrices(country: CountryCode) {
  const load = useCallback(() => fetchMarketPrices(country), [country])
  const { state, reload } = useCachedRemote(`prices:${country}`, load, isMarketPrices)
  return { view: choosePrices(state, country), reload }
}

export function useAdvice() {
  const { state, reload } = useCachedRemote('advice', fetchAdvice, isAdviceList)
  return { view: chooseAdvice(state), reload }
}
