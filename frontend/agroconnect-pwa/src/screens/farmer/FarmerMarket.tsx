import { useState } from 'react'
import { MarketPrices } from '../shared/MarketPrices'
import { BrowseProduce } from './BrowseProduce'
import { SellProduce } from './SellProduce'

type View = 'prices' | 'sell' | 'browse'

export function FarmerMarket() {
  const [view, setView] = useState<View>('prices')
  const back = () => setView('prices')

  if (view === 'sell') return <SellProduce onBack={back} />
  if (view === 'browse') return <BrowseProduce onBack={back} />
  return <MarketPrices onSell={() => setView('sell')} onBrowse={() => setView('browse')} />
}
