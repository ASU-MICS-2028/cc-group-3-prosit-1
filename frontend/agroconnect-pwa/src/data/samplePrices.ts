import type { PriceTable } from '../domain/country'

export const SAMPLE_PRICES_UPDATED = '2026-10-05'

/** Illustrative figures per kg in local currency. Shown with a "Sample prices" label until a market-info service exists. */
export const SAMPLE_PRICES: PriceTable = {
  GH: {
    maize: { price: 5.2, change: 3 },
    tomato: { price: 8.5, change: -6 },
    cassava: { price: 2.1, change: 0 },
    pepper: { price: 14, change: 8 },
    okro: { price: 7, change: -2 },
    yam: { price: 12, change: 1 },
    cocoa: { price: 45, change: 4 },
    plantain: { price: 4, change: 0 },
  },
  NG: {
    maize: { price: 650, change: 2 },
    tomato: { price: 1100, change: -9 },
    cassava: { price: 400, change: 0 },
    pepper: { price: 2200, change: 5 },
    okro: { price: 900, change: -1 },
    yam: { price: 1100, change: 3 },
    cocoa: { price: 4500, change: 6 },
    plantain: { price: 700, change: 1 },
  },
  KE: {
    maize: { price: 55, change: -3 },
    tomato: { price: 90, change: 7 },
    cassava: { price: 40, change: 0 },
    pepper: { price: 180, change: 4 },
    okro: { price: 120, change: -5 },
    yam: { price: 150, change: 2 },
    cocoa: { price: 450, change: 1 },
    plantain: { price: 60, change: 0 },
  },
}
