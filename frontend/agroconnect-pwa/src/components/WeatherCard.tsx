import { weatherAdvice } from '../domain/weather'
import { useT } from '../i18n/context'
import { useForecast } from '../weather/useForecast'
import { Button } from './Button'
import { RemoteView } from './RemoteView'
import { WeatherIcon } from './WeatherIcon'

/** Today's weather in short, for the farmer's Home. */
export function WeatherCard({ onOpen }: { onOpen: () => void }) {
  const { t } = useT()
  const { place, state, reload, stale } = useForecast()

  return (
    <section className="card">
      <h2 className="card-title">
        {t('farmer.weather')} · {place.name}
      </h2>
      <RemoteView state={state} onRetry={reload}>
        {(forecast) => {
          const today = forecast.days[0]
          const advice = weatherAdvice(forecast)
          return (
            <>
              <div className="weather-now">
                <WeatherIcon condition={forecast.current.condition} />
                <div>
                  <p className="weather-temp">{Math.round(forecast.current.temperature)}°</p>
                  <p className="farmer-meta">{t(`weather.condition.${forecast.current.condition}`)}</p>
                </div>
              </div>
              {today && <p>{t('weather.rainChance', { n: today.rainChance })}</p>}
              {advice && <p className="note">{t(`weather.advice.${advice}`)}</p>}
              {stale && <p className="farmer-meta">{t('weather.stale', { time: forecast.asOf.replace('T', ' ') })}</p>}
              <Button onClick={onOpen}>{t('weather.forecast')}</Button>
            </>
          )
        }}
      </RemoteView>
    </section>
  )
}
