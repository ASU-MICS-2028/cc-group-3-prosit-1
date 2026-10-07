import { parseForecast, type Forecast, type Place } from '../domain/weather'
import { requestJson } from '../lib/http'

const FORECAST_DAYS = 5

export function forecastUrl(place: Place): string {
  const params = new URLSearchParams({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    current: 'temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    timezone: 'auto',
    forecast_days: String(FORECAST_DAYS),
  })
  return `https://api.open-meteo.com/v1/forecast?${params}`
}

/** Open-Meteo is free and needs no key, so nothing secret is in the app. Only the town's coordinates are sent. */
export async function fetchForecast(place: Place): Promise<Forecast> {
  return parseForecast(await requestJson<unknown>(forecastUrl(place)))
}
