import { Button } from '../../components/Button'
import { CountryPicker } from '../../components/CountryPicker'
import { CropArt } from '../../components/CropArt'
import { CROP_BACKGROUND } from '../../components/cropColours'
import { SampleBadge } from '../../components/SampleBadge'
import { ScreenHeader } from '../../components/ScreenHeader'
import { SAMPLE_PRICES } from '../../data/samplePrices'
import { formatMoney } from '../../domain/country'
import { CROP_IDS } from '../../domain/farmer'
import { useT } from '../../i18n/context'
import { useSettings } from '../../settings/context'

export function MarketPrices({ onSell }: { onSell?: () => void }) {
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
                  {formatMoney(SAMPLE_PRICES[country][crop], country)} <span className="price-unit">{t('market.perKg')}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
        {onSell && (
          <Button variant="main" onClick={onSell}>
            {t('farmer.sell')}
          </Button>
        )}
      </main>
    </>
  )
}
