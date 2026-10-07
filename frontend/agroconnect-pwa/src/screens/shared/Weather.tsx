import { SampleBadge } from '../../components/SampleBadge'
import { ScreenHeader } from '../../components/ScreenHeader'
import { useT } from '../../i18n/context'

export function Weather({ onBack }: { onBack?: () => void }) {
  const { t } = useT()
  return (
    <>
      <ScreenHeader title={t('weather.title')} onBack={onBack} />
      <main className="screen-body">
        <section className="card">
          <SampleBadge label="common.sampleForecast" />
          <h2 className="card-title">{t('weather.today')}</h2>
          <p className="stat-number small">{t('farmer.weatherSample')}</p>
        </section>
        <p className="note">{t('weather.note')}</p>
      </main>
    </>
  )
}
