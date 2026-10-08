import { RemoteView } from '../../components/RemoteView'
import { ScreenHeader } from '../../components/ScreenHeader'
import { WeatherIcon } from '../../components/WeatherIcon'
import { placesIn, weatherAdvice } from '../../domain/weather'
import { useT } from '../../i18n/context'
import { useSettings } from '../../settings/context'
import { useForecast } from '../../weather/useForecast'

const weekday = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString([], { weekday: 'short' })

export function Weather({ onBack }: { onBack?: () => void }) {
  const { t } = useT()
  const { country, setPlace } = useSettings()
  const { place, state, reload, stale } = useForecast()

  return (
    <>
      <ScreenHeader title={t('weather.title')} subtitle={place.name} onBack={onBack} />
      <main className="screen-body">
        <section className="card">
          <fieldset className="language-picker">
            <legend className="label">{t('weather.place')}</legend>
            <div className="pill-row">
              {placesIn(country).map((option) => (
                <button key={option.id} type="button" className={option.id === place.id ? 'pill is-selected' : 'pill'} aria-pressed={option.id === place.id} onClick={() => setPlace(option.id)}>
                  {option.name}
                </button>
              ))}
            </div>
          </fieldset>
        </section>

        <RemoteView state={state} onRetry={reload}>
          {(forecast) => {
            const advice = weatherAdvice(forecast)
            return (
              <>
                {stale && (
                  <p className="note" role="status">
                    {t('weather.stale', { time: forecast.asOf.replace('T', ' ') })}
                  </p>
                )}
                <section className="card">
                  <h2 className="card-title">{t('weather.now')}</h2>
                  <div className="weather-now">
                    <WeatherIcon condition={forecast.current.condition} size={72} />
                    <div>
                      <p className="weather-temp">{Math.round(forecast.current.temperature)}°</p>
                      <p className="farmer-meta">{t(`weather.condition.${forecast.current.condition}`)}</p>
                    </div>
                  </div>
                  <p>
                    {t('weather.humidity', { n: Math.round(forecast.current.humidity) })} · {t('weather.wind', { n: Math.round(forecast.current.windKph) })}
                  </p>
                  {!stale && <p className="farmer-meta">{t('weather.updated', { time: forecast.asOf.replace('T', ' ') })}</p>}
                </section>

                {advice && <p className="note">{t(`weather.advice.${advice}`)}</p>}

                <section className="card">
                  <h2 className="card-title">{t('weather.days')}</h2>
                  <ul className="weather-days">
                    {forecast.days.map((day, index) => (
                      <li key={day.date} className="weather-day">
                        <span className="weather-day-name">{index === 0 ? t('weather.today') : weekday(day.date)}</span>
                        <WeatherIcon condition={day.condition} size={40} />
                        <span className="weather-day-detail">
                          <strong>{t('weather.range', { min: Math.round(day.min), max: Math.round(day.max) })}</strong>
                          <span className="farmer-meta">
                            {t(`weather.condition.${day.condition}`)} · {t('weather.rainChance', { n: day.rainChance })}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              </>
            )
          }}
        </RemoteView>
      </main>
    </>
  )
}
