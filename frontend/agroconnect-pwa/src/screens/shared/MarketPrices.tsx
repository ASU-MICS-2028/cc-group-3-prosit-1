import { Button } from '../../components/Button'
import { CountryPicker } from '../../components/CountryPicker'
import { CropArt } from '../../components/CropArt'
import { PriceChange } from '../../components/PriceChange'
import { CROP_BACKGROUND } from '../../components/cropColours'
import { SampleBadge } from '../../components/SampleBadge'
import { ScreenHeader } from '../../components/ScreenHeader'
import { SAMPLE_PRICES, SAMPLE_PRICES_UPDATED } from '../../data/samplePrices'
import { formatMoney } from '../../domain/country'
import { CROP_IDS } from '../../domain/farmer'
import { useT } from '../../i18n/context'
import { useSettings } from '../../settings/context'

interface MarketPricesProps {
  onSell?: () => void
  onBrowse?: () => void
}

export function MarketPrices({ onSell, onBrowse }: MarketPricesProps) {
  const { t } = useT()
  const { country } = useSettings()

  return (
    <>
      <ScreenHeader title={t('market.title')} />
      <main className="screen-body">
        <section className="card">
          <CountryPicker />
        </section>
        <section className="card">
          <SampleBadge label="common.samplePrices" />
          <ul className="price-list">
            {CROP_IDS.map((crop) => (
              <li key={crop} className="price-row">
                <span className="crop-tile" style={{ background: CROP_BACKGROUND[crop] }}>
                  <CropArt crop={crop} size={36} />
                </span>
                <span className="price-name">{t(`crop.${crop}`)}</span>
                <span className="price-value">
                  {formatMoney(SAMPLE_PRICES[country][crop].price, country)} <span className="price-unit">{t('market.perKg')}</span>
                  <PriceChange change={SAMPLE_PRICES[country][crop].change} />
                </span>
              </li>
            ))}
          </ul>
          <p className="farmer-meta">{t('market.updated', { date: new Date(SAMPLE_PRICES_UPDATED).toLocaleDateString([], { dateStyle: 'medium' }) })}</p>
        </section>
        {onSell && (
          <Button variant="main" onClick={onSell}>
            {t('farmer.sell')}
          </Button>
        )}
        {onBrowse && <Button onClick={onBrowse}>{t('market.browse')}</Button>}
      </main>
    </>
  )
}
