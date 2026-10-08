import { Button } from '../../components/Button'
import { CropArt } from '../../components/CropArt'
import { CROP_BACKGROUND } from '../../components/cropColours'
import { PriceChange } from '../../components/PriceChange'
import { SampleBadge } from '../../components/SampleBadge'
import { WeatherCard } from '../../components/WeatherCard'
import { ScreenHeader } from '../../components/ScreenHeader'
import { useState } from 'react'
import { useCurrentUser } from '../../auth/useCurrentUser'
import { useAdvice, useMarketPrices } from '../../content/useContent'
import { formatMoney } from '../../domain/country'
import { useT } from '../../i18n/context'
import { useSettings } from '../../settings/context'
import type { FarmerTab } from '../../apps/tabs'
import { Weather } from '../shared/Weather'

const FEATURED_COUNT = 3

export function FarmerHome({ onGo }: { onGo: (tab: FarmerTab) => void }) {
  const { t } = useT()
  const { country } = useSettings()
  const user = useCurrentUser()
  const name = user?.name.trim()
  const [showWeather, setShowWeather] = useState(false)
  const { view: prices } = useMarketPrices(country)
  const { view: advice } = useAdvice()
  const latestAdvice = advice?.cards[0]

  if (showWeather) return <Weather onBack={() => setShowWeather(false)} />

  return (
    <>
      <ScreenHeader title={name ? t('farmer.hello', { name }) : t('farmer.helloNoName')} />
      <main className="screen-body">
        <WeatherCard onOpen={() => setShowWeather(true)} />

        <section className="card">
          <h2 className="card-title">{t('farmer.prices')}</h2>
          {prices?.sample && <SampleBadge label="common.samplePrices" />}
          <ul className="price-list">
            {prices?.rows.slice(0, FEATURED_COUNT).map(({ crop, price, change }) => (
              <li key={crop} className="price-row">
                <span className="crop-tile" style={{ background: CROP_BACKGROUND[crop] }}>
                  <CropArt crop={crop} size={36} />
                </span>
                <span className="price-name">{t(`crop.${crop}`)}</span>
                <span className="price-value">
                  {formatMoney(price, country)}
                  <PriceChange change={change} />
                </span>
              </li>
            ))}
          </ul>
        </section>

        {latestAdvice && (
          <section className="card">
            <h2 className="card-title">{t('farmer.advice')}</h2>
            {advice?.sample && <SampleBadge label="common.sampleAdvice" />}
            <p className="card-title">{latestAdvice.title}</p>
            <p>{latestAdvice.body}</p>
          </section>
        )}

        <Button variant="main" onClick={() => onGo('market')}>
          {t('farmer.sell')}
        </Button>
        <Button onClick={() => onGo('advice')}>{t('farmer.cropCheck')}</Button>
        <Button onClick={() => onGo('wallet')}>{t('farmer.openWallet')}</Button>
      </main>
    </>
  )
}
