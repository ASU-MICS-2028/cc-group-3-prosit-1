import { useState } from 'react'
import { MarketPrices } from '../shared/MarketPrices'
import { SellProduce } from './SellProduce'

export function FarmerMarket() {
  const [selling, setSelling] = useState(false)
  return selling ? <SellProduce onBack={() => setSelling(false)} /> : <MarketPrices onSell={() => setSelling(true)} />
}
