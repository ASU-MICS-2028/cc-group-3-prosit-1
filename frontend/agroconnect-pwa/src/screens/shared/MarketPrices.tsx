import { Button } from '../../components/Button'
import { CountryPicker } from '../../components/CountryPicker'
import { CropArt } from '../../components/CropArt'
import { PriceChange } from '../../components/PriceChange'
import { CROP_BACKGROUND } from '../../components/cropColours'
import { SampleBadge } from '../../components/SampleBadge'
import { ScreenHeader } from '../../components/ScreenHeader'
import { useMarketPrices } from '../../content/useContent'
import { formatMoney } from '../../domain/country'
import { useT } from '../../i18n/context'
import { useSettings } from '../../settings/context'

interface MarketPricesProps {
  onSell?: () => void
  onBrowse?: () => void
}

export function MarketPrices({ onSell, onBrowse }: MarketPricesProps) {
  const { t } = useT()
  const { country } = useSettings()
  const { view } = useMarketPrices(country)

  return (
    <>
      <ScreenHeader title={t('market.title')} />
      <main className="screen-body">
        <section className="card">
          <CountryPicker />
        </section>
        <section className="card">
          {!view && <p>{t('common.loading')}</p>}
          {view?.sample && <SampleBadge label="common.samplePrices" />}
          <ul className="price-list">
            {view?.rows.map(({ crop, price, change }) => (
              <li key={crop} className="price-row">
                <span className="crop-tile" style={{ background: CROP_BACKGROUND[crop] }}>
                  <CropArt crop={crop} size={36} />
                </span>
                <span className="price-name">{t(`crop.${crop}`)}</span>
                <span className="price-value">
                  {formatMoney(price, country)} <span className="price-unit">{t('market.perKg')}</span>
                  <PriceChange change={change} />
                </span>
              </li>
            ))}
          </ul>
          {view?.updatedOn && <p className="farmer-meta">{t('market.updated', { date: new Date(view.updatedOn).toLocaleDateString([], { dateStyle: 'medium' }) })}</p>}
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
