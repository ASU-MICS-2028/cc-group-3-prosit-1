import type { PriceTable } from '../domain/country'

/** Illustrative figures per kg in local currency. Shown with a "Sample prices" label until market-info exists. */
export const SAMPLE_PRICES: PriceTable = {
  GH: { maize: 5.2, tomato: 8.5, cassava: 2.1, pepper: 14, okro: 7, yam: 12, cocoa: 45, plantain: 4 },
  NG: { maize: 650, tomato: 1100, cassava: 400, pepper: 2200, okro: 900, yam: 1100, cocoa: 4500, plantain: 700 },
  KE: { maize: 55, tomato: 90, cassava: 40, pepper: 180, okro: 120, yam: 150, cocoa: 450, plantain: 60 },
}
