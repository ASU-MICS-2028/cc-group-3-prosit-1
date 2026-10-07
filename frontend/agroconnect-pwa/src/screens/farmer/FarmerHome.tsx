import { Button } from '../../components/Button'
import { CropArt } from '../../components/CropArt'
import { CROP_BACKGROUND } from '../../components/cropColours'
import { SampleBadge } from '../../components/SampleBadge'
import { ScreenHeader } from '../../components/ScreenHeader'
import { useCurrentUser } from '../../auth/useCurrentUser'
import { SAMPLE_ADVICE } from '../../data/sampleAdvice'
import { SAMPLE_PRICES } from '../../data/samplePrices'
import { formatMoney } from '../../domain/country'
import { useT } from '../../i18n/context'
import { useSettings } from '../../settings/context'
import type { FarmerTab } from '../../apps/tabs'

const FEATURED_CROPS = ['maize', 'tomato', 'cassava'] as const
const [latestAdvice] = SAMPLE_ADVICE

export function FarmerHome({ onGo }: { onGo: (tab: FarmerTab) => void }) {
  const { t } = useT()
  const { country } = useSettings()
  const user = useCurrentUser()
  const name = user?.name.trim()

  return (
    <>
      <ScreenHeader title={name ? t('farmer.hello', { name }) : t('farmer.helloNoName')} />
      <main className="screen-body">
        <section className="card">
          <h2 className="card-title">{t('farmer.weather')}</h2>
          <SampleBadge label="common.sampleForecast" />
          <p className="stat-number small">{t('farmer.weatherSample')}</p>
        </section>

        <section className="card">
          <h2 className="card-title">{t('farmer.prices')}</h2>
          <SampleBadge label="common.samplePrices" />
          <ul className="price-list">
            {FEATURED_CROPS.map((crop) => (
              <li key={crop} className="price-row">
                <span className="crop-tile" style={{ background: CROP_BACKGROUND[crop] }}>
                  <CropArt crop={crop} size={36} />
                </span>
                <span className="price-name">{t(`crop.${crop}`)}</span>
                <span className="price-value">{formatMoney(SAMPLE_PRICES[country][crop], country)}</span>
              </li>
            ))}
          </ul>
        </section>

        {latestAdvice && (
          <section className="card">
            <h2 className="card-title">{t('farmer.advice')}</h2>
            <SampleBadge label="common.sampleAdvice" />
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
